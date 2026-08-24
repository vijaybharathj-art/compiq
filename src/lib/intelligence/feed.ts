import type { PrismaClient } from "@/generated/prisma/client";

// IntelligenceFeedService — the "What Changed?" engine (PHASE4_DEAL_INTELLIGENCE.md
// §3-6, §35-36). Priority-ranked by importanceScore (computed once, at
// write time, by src/lib/pipeline/intelligence-events.ts — this service
// only reads and filters, never recomputes).

export type FeedFilter =
  | "ALL"
  | "MY_DEALS"
  | "HIGH_PRIORITY"
  | "STAGE"
  | "VALUATION"
  | "RISKS"
  | "INACTIVITY"
  | "DEADLINES"
  | "TASKS"
  | "OPPORTUNITIES"
  | "CLIENT_ACTIVITY";

export type FeedSort = "IMPORTANCE" | "NEWEST";

export interface FeedQuery {
  filter?: FeedFilter;
  search?: string;
  userId?: string;
  since?: Date;
  limit?: number;
  sort?: FeedSort;
}

const FILTER_EVENT_TYPES: Partial<Record<FeedFilter, string[]>> = {
  STAGE: ["STAGE_CHANGED"],
  VALUATION: ["DEAL_VALUE_CHANGED"],
  RISKS: ["RISK_DETECTED", "DEAL_INACTIVE"],
  INACTIVITY: ["DEAL_INACTIVE"],
  DEADLINES: ["DEADLINE_DETECTED"],
  TASKS: ["TASK_CREATED"],
  OPPORTUNITIES: ["OPPORTUNITY_DETECTED"],
  CLIENT_ACTIVITY: ["CLIENT_ACTIVITY", "IMPORTANT_EMAIL"],
};

export async function getIntelligenceFeed(db: PrismaClient, organizationId: string, query: FeedQuery = {}) {
  const where: Record<string, unknown> = { organizationId };

  if (query.since) where.occurredAt = { gte: query.since };

  const eventTypes = query.filter ? FILTER_EVENT_TYPES[query.filter] : undefined;
  if (eventTypes) where.eventType = { in: eventTypes };

  if (query.filter === "HIGH_PRIORITY") where.importanceScore = { gte: 75 };

  if (query.filter === "MY_DEALS" && query.userId) {
    where.deal = { leadBankerId: query.userId };
  }

  if (query.search) {
    const term = query.search.trim();
    if (term) {
      where.OR = [
        { headline: { contains: term, mode: "insensitive" } },
        { detail: { contains: term, mode: "insensitive" } },
        { deal: { projectCodename: { contains: term, mode: "insensitive" } } },
        { client: { name: { contains: term, mode: "insensitive" } } },
      ];
    }
  }

  const orderBy =
    query.sort === "NEWEST" ? [{ occurredAt: "desc" as const }] : [{ importanceScore: "desc" as const }, { occurredAt: "desc" as const }];

  return db.intelligenceEvent.findMany({
    where,
    orderBy,
    take: query.limit ?? 50,
    include: {
      deal: { select: { id: true, projectCodename: true, valueMinorUnits: true, enterpriseValueMinorUnits: true, currency: true } },
      client: { select: { id: true, name: true } },
      sourceEmail: { select: { fromName: true, fromAddress: true, subject: true, bodyText: true, receivedAt: true } },
    },
  });
}

export interface WhatChangedSummary {
  since: Date;
  dealsChanged: number;
  requiresAttention: number;
  dealsAdvanced: number;
  newOpportunities: number;
  risks: number;
  totalValueAffectedMinorUnits: bigint;
  topEvents: Awaited<ReturnType<typeof getIntelligenceFeed>>;
}

/**
 * Powers both the dashboard's "N deals changed" summary and its click-through
 * to a pre-filtered feed (spec §38) — same query, same window, so the
 * number shown always matches what the click reveals.
 */
export async function getWhatChangedSince(
  db: PrismaClient,
  organizationId: string,
  since: Date,
): Promise<WhatChangedSummary> {
  const events = await db.intelligenceEvent.findMany({
    where: { organizationId, occurredAt: { gte: since } },
    orderBy: [{ importanceScore: "desc" }, { occurredAt: "desc" }],
    include: {
      deal: { select: { id: true, projectCodename: true, valueMinorUnits: true, enterpriseValueMinorUnits: true, currency: true } },
      client: { select: { id: true, name: true } },
      sourceEmail: { select: { fromName: true, fromAddress: true, subject: true, bodyText: true, receivedAt: true } },
    },
  });

  const dealIds = new Set(events.filter((e) => e.dealId).map((e) => e.dealId!));
  const stageAdvancedDeals = new Set(events.filter((e) => e.eventType === "STAGE_CHANGED").map((e) => e.dealId));
  const opportunities = events.filter((e) => e.eventType === "OPPORTUNITY_DETECTED").length;
  const risks = events.filter((e) => e.eventType === "RISK_DETECTED" || e.eventType === "DEAL_INACTIVE").length;
  const requiresAttention = events.filter((e) => (e.importanceScore ?? 0) >= 75).length;

  let totalValueAffectedMinorUnits = 0n;
  const seenForValue = new Set<string>();
  for (const event of events) {
    if (!event.dealId || seenForValue.has(event.dealId)) continue;
    if (event.eventType !== "DEAL_VALUE_CHANGED" && event.eventType !== "STAGE_CHANGED") continue;
    seenForValue.add(event.dealId);
    const value = event.deal?.enterpriseValueMinorUnits ?? event.deal?.valueMinorUnits;
    if (value) totalValueAffectedMinorUnits += value;
  }

  return {
    since,
    dealsChanged: dealIds.size,
    requiresAttention,
    dealsAdvanced: stageAdvancedDeals.size,
    newOpportunities: opportunities,
    risks,
    totalValueAffectedMinorUnits,
    topEvents: events.slice(0, 8),
  };
}
