import { getPrismaClient } from "@/lib/db";
import { DEMO_NOW } from "@/lib/constants";
import { getAIProvider } from "@/lib/ai";
import type { BriefingFacts } from "@/lib/ai/types";
import { getWhatChangedSince } from "./feed";
import { getOpenRisksForDeal } from "./risk-engine";
import { bucketDeadline, deadlineUrgency } from "./deadline";
import { generateRecommendedActions } from "./recommendations";
import { parseBriefingContent, parseBriefingSummary, type BriefingContent, type BriefingSummary } from "./briefing-schema";

// BriefingService (PHASE4_DEAL_INTELLIGENCE.md §7-11, §39-45, §78).
// Pipeline: Database Events → Filtering → Importance Ranking → Deal
// Context → Task/Risk Context → AI Summary → Structured Briefing (§10).
// Every section below is assembled from real queries; the AI provider only
// ever narrates the already-assembled facts (see summarizeBriefing on
// AIProvider) and never supplies a number that ends up rendered directly.

const AI_MODEL_LABEL = process.env.AI_PROVIDER ?? "demo";

async function windowStartFor(organizationId: string, userId: string, fallbackHoursAgo: number, now: Date) {
  const db = getPrismaClient();
  const lastBriefing = await db.briefing.findFirst({
    where: { organizationId, userId },
    orderBy: { generatedAt: "desc" },
  });
  if (lastBriefing) return lastBriefing.generatedAt;
  return new Date(now.getTime() - fallbackHoursAgo * 60 * 60 * 1000);
}

async function buildDealAdvancements(organizationId: string, since: Date) {
  const db = getPrismaClient();
  const events = await db.intelligenceEvent.findMany({
    where: { organizationId, eventType: "STAGE_CHANGED", occurredAt: { gte: since } },
    include: { deal: { select: { id: true, projectCodename: true } } },
    orderBy: { occurredAt: "desc" },
  });
  return events
    .filter((e) => e.deal && e.deltaFrom && e.deltaTo)
    .map((e) => ({
      dealId: e.deal!.id,
      dealCodename: e.deal!.projectCodename,
      previousStage: e.deltaFrom!,
      newStage: e.deltaTo!,
      sourceEventId: e.id,
    }));
}

async function buildRisksSection(organizationId: string) {
  const db = getPrismaClient();
  const deals = await db.deal.findMany({ where: { organizationId }, select: { id: true, projectCodename: true } });
  const results: BriefingContent["risks"] = [];
  for (const deal of deals) {
    const risks = await getOpenRisksForDeal(db, deal.id);
    for (const risk of risks.slice(0, 2)) {
      results.push({
        riskId: risk.id,
        dealId: deal.id,
        dealCodename: deal.projectCodename,
        description: risk.description,
        severity: risk.severity,
        sourceEventId: risk.intelligenceEventId ?? undefined,
      });
    }
  }
  return results
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 8);
}

function severityRank(severity: string): number {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[severity] ?? 0;
}

async function buildDeadlinesSection(organizationId: string, now: Date) {
  const db = getPrismaClient();
  const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const tasks = await db.task.findMany({
    where: { organizationId, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { lte: windowEnd } },
    include: { deal: { select: { id: true, projectCodename: true } } },
    orderBy: { dueDate: "asc" },
    take: 10,
  });
  return tasks
    .filter((t) => t.dueDate)
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      dealId: t.deal?.id,
      dealCodename: t.deal?.projectCodename,
      dueLabel: bucketDeadline(t.dueDate!, now),
      urgency: deadlineUrgency(t.dueDate!, now),
    }));
}

async function buildOpportunitiesSection(organizationId: string, since: Date) {
  const db = getPrismaClient();
  const opportunities = await db.opportunity.findMany({
    where: { organizationId, status: { in: ["NEW", "ACKNOWLEDGED"] }, createdAt: { gte: since } },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return opportunities.map((o) => ({
    clientId: o.client.id,
    clientName: o.client.name,
    signalText: o.signalText,
    sourceEventId: undefined,
  }));
}

interface AssembledBriefing {
  content: BriefingContent;
  summary: BriefingSummary;
}

async function assembleContent(organizationId: string, userId: string, since: Date, now: Date): Promise<AssembledBriefing> {
  const [whatChanged, dealAdvancements, risks, deadlines, opportunities, recommendedActions, tasksCreated] =
    await Promise.all([
      getWhatChangedSince(getPrismaClient(), organizationId, since),
      buildDealAdvancements(organizationId, since),
      buildRisksSection(organizationId),
      buildDeadlinesSection(organizationId, now),
      buildOpportunitiesSection(organizationId, since),
      generateRecommendedActions(getPrismaClient(), organizationId, { limit: 5, since }),
      getPrismaClient().intelligenceEvent.count({ where: { organizationId, eventType: "TASK_CREATED", occurredAt: { gte: since } } }),
    ]);

  const priorities = whatChanged.topEvents.slice(0, 5).map((e) => ({
    headline: e.headline,
    reason: e.detail ?? e.headline,
    dealId: e.dealId ?? undefined,
    dealCodename: e.deal?.projectCodename,
    sourceEventId: e.id,
  }));

  const facts: BriefingFacts = {
    date: now.toISOString().slice(0, 10),
    summary: {
      dealsChanged: whatChanged.dealsChanged,
      dealsAdvanced: whatChanged.dealsAdvanced,
      risks: risks.length,
      opportunities: opportunities.length,
      tasksCreated,
    },
    priorities: priorities.map((p) => ({ headline: p.headline, reason: p.reason })),
    dealAdvancements: dealAdvancements.map((d) => ({ dealCodename: d.dealCodename, previousStage: d.previousStage, newStage: d.newStage })),
    risks: risks.map((r) => ({ dealCodename: r.dealCodename, description: r.description, severity: r.severity })),
    deadlines: deadlines.map((d) => ({ title: d.title, dealCodename: d.dealCodename, dueLabel: d.dueLabel })),
    opportunities: opportunities.map((o) => ({ clientName: o.clientName, signalText: o.signalText })),
  };

  const { narrative } = await getAIProvider().summarizeBriefing(facts);

  const content = parseBriefingContent({
    narrative,
    priorities,
    dealAdvancements,
    risks,
    deadlines,
    opportunities,
    recommendedActions,
  });
  const summary = parseBriefingSummary(facts.summary);

  return { content, summary };
}

function collectSourceEventIds(content: BriefingContent): string[] {
  const ids = new Set<string>();
  for (const p of content.priorities) if (p.sourceEventId) ids.add(p.sourceEventId);
  for (const d of content.dealAdvancements) if (d.sourceEventId) ids.add(d.sourceEventId);
  for (const r of content.risks) if (r.sourceEventId) ids.add(r.sourceEventId);
  for (const o of content.opportunities) if (o.sourceEventId) ids.add(o.sourceEventId);
  for (const a of content.recommendedActions) if (a.sourceEventId) ids.add(a.sourceEventId);
  return Array.from(ids);
}

async function generateBriefing(organizationId: string, userId: string, type: "MORNING" | "EVENING", now: Date) {
  const db = getPrismaClient();
  const fallbackHours = type === "MORNING" ? 24 : 12;
  const since = await windowStartFor(organizationId, userId, fallbackHours, now);

  const { content, summary } = await assembleContent(organizationId, userId, since, now);
  const dateOnly = new Date(now.toISOString().slice(0, 10));
  const sourceEventIds = collectSourceEventIds(content);

  return db.briefing.upsert({
    where: { organizationId_userId_type_date: { organizationId, userId, type, date: dateOnly } },
    create: {
      organizationId,
      userId,
      type,
      date: dateOnly,
      summary: summary as never,
      content: content as never,
      sourceEventIds,
      model: AI_MODEL_LABEL,
      promptVersion: "briefing-summary-v1",
      status: "GENERATED",
    },
    update: {
      summary: summary as never,
      content: content as never,
      sourceEventIds,
      model: AI_MODEL_LABEL,
      status: "GENERATED",
      generatedAt: now,
    },
  });
}

export async function generateMorningBriefing(organizationId: string, userId: string, now: Date = DEMO_NOW) {
  return generateBriefing(organizationId, userId, "MORNING", now);
}

export async function generateEveningBriefing(organizationId: string, userId: string, now: Date = DEMO_NOW) {
  return generateBriefing(organizationId, userId, "EVENING", now);
}

export async function getLatestBriefing(organizationId: string, userId: string, type: "MORNING" | "EVENING") {
  const db = getPrismaClient();
  return db.briefing.findFirst({ where: { organizationId, userId, type }, orderBy: { generatedAt: "desc" } });
}
