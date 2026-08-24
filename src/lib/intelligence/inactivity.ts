import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_NOW } from "@/lib/constants";
import { createIntelligenceEvent } from "@/lib/pipeline/intelligence-events";

// Deal Inactivity Engine (PHASE4_DEAL_INTELLIGENCE.md §16-18, §50, §59).
// "Meaningful activity" is tracked as Deal.lastMeaningfulActivityAt — a
// separate column from lastActivityAt, updated only at the specific write
// sites listed in touchMeaningfulActivity() below (never bumped by, say, a
// NOT_RELEVANT email or a routine page view). Day counts are business days
// (weekends excluded) so a deal untouched over a weekend doesn't read as
// "2 days inactive" come Monday morning; full holiday-calendar awareness is
// a documented limitation (spec §17 says "where possible" — out of scope
// for the demo without a maintained holiday list).

export type InactivityStatus = "ACTIVE" | "WATCH" | "INACTIVE" | "STALE";

export interface InactivityThresholds {
  watchDays: number;
  inactiveDays: number;
  staleDays: number;
}

// Configurable per spec §17 — env vars keep this genuinely adjustable
// without a settings-table migration, matching the pattern already used by
// src/lib/ai/confidence-policy.ts.
export function getInactivityThresholds(): InactivityThresholds {
  return {
    watchDays: Number(process.env.INACTIVITY_WATCH_DAYS ?? 4),
    inactiveDays: Number(process.env.INACTIVITY_INACTIVE_DAYS ?? 7),
    staleDays: Number(process.env.INACTIVITY_STALE_DAYS ?? 14),
  };
}

/**
 * Deals early in their workflow naturally have longer gaps between touches;
 * deals in active buyer/management engagement (the back third of a
 * workflow's stage list) are expected to move faster, so the same gap
 * there is more concerning. Generic over any service's stage list (no
 * hardcoded stage keys) via position-in-workflow rather than stage name.
 */
export function stageThresholdMultiplier(stageSortOrder: number, totalStages: number): number {
  if (totalStages <= 1) return 1;
  const fraction = stageSortOrder / (totalStages - 1);
  if (fraction <= 1 / 3) return 1.5;
  if (fraction >= 2 / 3) return 0.7;
  return 1;
}

export function businessDaysBetween(from: Date, to: Date): number {
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function classifyInactivity(
  businessDaysInactive: number,
  thresholds: InactivityThresholds,
  multiplier: number,
): InactivityStatus {
  if (businessDaysInactive >= thresholds.staleDays * multiplier) return "STALE";
  if (businessDaysInactive >= thresholds.inactiveDays * multiplier) return "INACTIVE";
  if (businessDaysInactive >= thresholds.watchDays * multiplier) return "WATCH";
  return "ACTIVE";
}

export interface DealInactivityAssessment {
  dealId: string;
  status: InactivityStatus;
  businessDaysInactive: number;
  lastMeaningfulActivityAt: Date | null;
  exempt: boolean;
  exemptReason?: string;
}

interface DealForAssessment {
  id: string;
  lastMeaningfulActivityAt: Date | null;
  createdAt: Date;
  currentStage: { sortOrder: number };
  workflow: { stages: { sortOrder: number }[] };
}

async function loadException(db: PrismaClient, dealId: string, now: Date) {
  const exception = await db.inactivityException.findUnique({ where: { dealId } });
  if (!exception) return null;
  if (exception.ignoredUntil && exception.ignoredUntil < now) return null; // expired
  return exception;
}

export function assessInactivityForDeal(
  deal: DealForAssessment,
  now: Date,
  thresholds: InactivityThresholds,
): Omit<DealInactivityAssessment, "exempt" | "exemptReason"> {
  const anchor = deal.lastMeaningfulActivityAt ?? deal.createdAt;
  const businessDaysInactive = businessDaysBetween(anchor, now);
  const totalStages = deal.workflow.stages.length;
  const multiplier = stageThresholdMultiplier(deal.currentStage.sortOrder, totalStages);
  const status = classifyInactivity(businessDaysInactive, thresholds, multiplier);
  return { dealId: deal.id, status, businessDaysInactive, lastMeaningfulActivityAt: deal.lastMeaningfulActivityAt };
}

export async function assessDealInactivity(
  db: PrismaClient,
  dealId: string,
  now: Date = DEMO_NOW,
): Promise<DealInactivityAssessment> {
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      id: true,
      lastMeaningfulActivityAt: true,
      createdAt: true,
      currentStage: { select: { sortOrder: true } },
      workflow: { select: { stages: { select: { sortOrder: true } } } },
    },
  });
  const base = assessInactivityForDeal(deal, now, getInactivityThresholds());
  const exception = await loadException(db, dealId, now);
  return { ...base, exempt: Boolean(exception), exemptReason: exception?.reason ?? undefined };
}

/**
 * Bumps Deal.lastMeaningfulActivityAt. Call sites: applyChangeToDeal
 * (stage/value change), meeting creation, task completion, and a matched
 * relevant email even with no detected field change (receiving substantive
 * correspondence about the deal is itself meaningful — spec §16).
 */
export async function touchMeaningfulActivity(db: PrismaClient, dealId: string, at: Date): Promise<void> {
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { lastMeaningfulActivityAt: true } });
  if (deal && deal.lastMeaningfulActivityAt && deal.lastMeaningfulActivityAt >= at) return; // don't move it backward
  await db.deal.update({ where: { id: dealId }, data: { lastMeaningfulActivityAt: at } });
}

export async function setInactivityException(
  db: PrismaClient,
  dealId: string,
  params: { reason: string; ignoredUntil: Date | null; createdById?: string },
): Promise<void> {
  await db.inactivityException.upsert({
    where: { dealId },
    create: { dealId, reason: params.reason, ignoredUntil: params.ignoredUntil, createdById: params.createdById },
    update: { reason: params.reason, ignoredUntil: params.ignoredUntil, createdById: params.createdById },
  });
}

export async function clearInactivityException(db: PrismaClient, dealId: string): Promise<void> {
  await db.inactivityException.deleteMany({ where: { dealId } });
}

/**
 * Scans every deal in the org and returns those that have crossed into
 * INACTIVE/STALE and are not exception-covered. Pure assessment — no
 * writes — kept separate from runInactivityScan() below so it stays
 * trivially unit-testable.
 */
export async function assessInactiveDeals(
  db: PrismaClient,
  organizationId: string,
  now: Date = DEMO_NOW,
): Promise<DealInactivityAssessment[]> {
  const deals = await db.deal.findMany({
    where: { organizationId, currentStage: { key: { not: "closing" } } },
    select: {
      id: true,
      lastMeaningfulActivityAt: true,
      createdAt: true,
      currentStage: { select: { sortOrder: true } },
      workflow: { select: { stages: { select: { sortOrder: true } } } },
    },
  });

  const thresholds = getInactivityThresholds();
  const results: DealInactivityAssessment[] = [];
  for (const deal of deals) {
    const base = assessInactivityForDeal(deal, now, thresholds);
    if (base.status !== "INACTIVE" && base.status !== "STALE") continue;
    const exception = await loadException(db, deal.id, now);
    results.push({ ...base, exempt: Boolean(exception), exemptReason: exception?.reason ?? undefined });
  }
  return results;
}

const REDETECTION_WINDOW_HOURS = 24;

/**
 * The DB-writing counterpart (spec §78) — assesses every deal, then creates
 * one DEAL_INACTIVE intelligence event per non-exempt deal that just
 * crossed the threshold, skipping deals that already got one in the last
 * 24h (idempotency — spec §47's dedup requirement applies here too, not
 * just to email-derived events).
 */
export async function runInactivityScan(organizationId: string, now: Date = DEMO_NOW) {
  const { getPrismaClient } = await import("@/lib/db");
  const db = getPrismaClient();

  const assessments = await assessInactiveDeals(db, organizationId, now);
  const created: DealInactivityAssessment[] = [];

  for (const assessment of assessments) {
    if (assessment.exempt) continue;

    const recentDuplicate = await db.intelligenceEvent.findFirst({
      where: {
        organizationId,
        dealId: assessment.dealId,
        eventType: "DEAL_INACTIVE",
        createdAt: { gte: new Date(now.getTime() - REDETECTION_WINDOW_HOURS * 60 * 60 * 1000) },
      },
    });
    if (recentDuplicate) continue;

    const deal = await db.deal.findUniqueOrThrow({
      where: { id: assessment.dealId },
      select: { clientId: true, currentStage: { select: { label: true } } },
    });

    const event = await createIntelligenceEvent(db, {
      organizationId,
      eventType: "DEAL_INACTIVE",
      dealId: assessment.dealId,
      clientId: deal.clientId,
      headline: `No meaningful activity for ${assessment.businessDaysInactive} business days`,
      detail: `Stage: ${deal.currentStage.label}. Recommended action: follow up with the client.`,
      occurredAt: now,
      requiresAction: true,
    });
    await db.auditLog.create({
      data: {
        organizationId,
        actorUserId: null,
        action: "Inactivity detected",
        entityType: "Deal",
        entityId: assessment.dealId,
        metadata: { businessDaysInactive: assessment.businessDaysInactive, status: assessment.status, intelligenceEventId: event.id },
      },
    });
    created.push(assessment);
  }

  return { assessedCount: assessments.length, createdCount: created.length, created };
}
