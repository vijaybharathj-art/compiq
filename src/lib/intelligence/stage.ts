import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_NOW } from "@/lib/constants";

// Stage Intelligence (PHASE4_DEAL_INTELLIGENCE.md §19-21). Turns a raw
// STAGE_CHANGE DealEvent into a grounded, human-readable explanation plus
// stage-duration analytics — never inventing what a stage "means" beyond a
// generic, deterministic phrase keyed off the stage's key/label (works
// across every banking service's differing stage list, no hardcoded
// per-service vocabulary).

const PHASE_PHRASES: { test: RegExp; phrase: string }[] = [
  { test: /management_meeting|management meeting/i, phrase: "buyer/management engagement" },
  { test: /due_diligence|due diligence|diligence/i, phrase: "detailed diligence review" },
  { test: /indicative_bid|indicative bid/i, phrase: "indicative bidding" },
  { test: /final_bid|final bid/i, phrase: "final bidding" },
  { test: /documentation|signing/i, phrase: "definitive documentation" },
  { test: /clos/i, phrase: "transaction closing" },
  { test: /market|bookbuild/i, phrase: "active marketing" },
  { test: /pricing|allocation/i, phrase: "pricing and allocation" },
  { test: /mandate/i, phrase: "a confirmed mandate" },
  { test: /pitch/i, phrase: "the pitch process" },
  { test: /teaser|nda|information_memo/i, phrase: "buyer outreach" },
  { test: /origination|initial_discussion/i, phrase: "early-stage origination" },
];

function phaseDescription(stageKey: string, stageLabel: string): string {
  const match = PHASE_PHRASES.find((p) => p.test.test(stageKey) || p.test.test(stageLabel));
  return match?.phrase ?? "the next phase of the transaction";
}

export function explainStageChange(
  projectCodename: string,
  previousStageLabel: string,
  newStage: { key: string; label: string },
): string {
  const phase = phaseDescription(newStage.key, newStage.label);
  return `${projectCodename} has advanced from ${previousStageLabel} to ${newStage.label}, indicating the process has moved into ${phase}.`;
}

export interface StageVelocityEntry {
  stageLabel: string;
  startedAt: Date;
  endedAt: Date | null;
  days: number;
  isCurrent: boolean;
}

/**
 * Reconstructs time-in-stage from the deal's STAGE_CHANGE DealEvent
 * history (spec §20). The first entry starts at deal creation since no
 * DealEvent exists for the initial stage assignment.
 */
export async function computeStageVelocity(db: PrismaClient, dealId: string, now: Date = DEMO_NOW): Promise<StageVelocityEntry[]> {
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: { createdAt: true, currentStage: { select: { label: true } } },
  });
  const stageChanges = await db.dealEvent.findMany({
    where: { dealId, type: "STAGE_CHANGE" },
    orderBy: { occurredAt: "asc" },
  });

  const entries: StageVelocityEntry[] = [];
  let cursor = deal.createdAt;
  let cursorLabel = stageChanges[0]?.previousValue ?? deal.currentStage.label;

  for (const change of stageChanges) {
    const endedAt = change.occurredAt;
    entries.push({
      stageLabel: cursorLabel,
      startedAt: cursor,
      endedAt,
      days: Math.max(0, Math.round((endedAt.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24))),
      isCurrent: false,
    });
    cursor = endedAt;
    cursorLabel = change.newValue ?? cursorLabel;
  }

  entries.push({
    stageLabel: cursorLabel,
    startedAt: cursor,
    endedAt: null,
    days: Math.max(0, Math.round((now.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24))),
    isCurrent: true,
  });

  return entries;
}

export interface StageDelayAssessment {
  isPotentialDelay: boolean;
  currentStageDays: number;
  typicalStageDays: number | null;
  sampleSize: number;
  confidencePercent: number;
}

const MIN_SAMPLE_SIZE = 2;
const DELAY_MULTIPLIER = 1.5;

/**
 * Compares the deal's time in its current stage against the historical
 * average for other deals (same banking service) that passed through a
 * stage with the same key. Requires at least MIN_SAMPLE_SIZE historical
 * observations — with too little data, reports "no verdict" rather than a
 * guess (spec §21: never claim delay without sufficient evidence).
 */
export async function detectStageDelay(db: PrismaClient, dealId: string, now: Date = DEMO_NOW): Promise<StageDelayAssessment> {
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      bankingServiceId: true,
      currentStageId: true,
      currentStage: { select: { label: true } },
    },
  });

  const velocity = await computeStageVelocity(db, dealId, now);
  const currentStageDays = velocity[velocity.length - 1]?.days ?? 0;

  // Historical samples: completed (non-current) stage durations for other
  // deals in the same service whose stage key matches the current one.
  const otherDeals = await db.deal.findMany({
    where: { bankingServiceId: deal.bankingServiceId, id: { not: dealId } },
    select: { id: true, createdAt: true },
  });

  const samples: number[] = [];
  for (const other of otherDeals) {
    const otherEvents = await db.dealEvent.findMany({
      where: { dealId: other.id, type: "STAGE_CHANGE" },
      orderBy: { occurredAt: "asc" },
      select: { occurredAt: true, previousValue: true, newValue: true },
    });
    let cursor = other.createdAt;
    for (const evt of otherEvents) {
      // We only have labels on DealEvent, but stage *keys* are what we
      // compare against — approximate via the current deal's stage label
      // as a proxy (labels are unique per workflow in this dataset).
      if (evt.previousValue === deal.currentStage.label) {
        samples.push(Math.round((evt.occurredAt.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24)));
      }
      cursor = evt.occurredAt;
    }
  }

  if (samples.length < MIN_SAMPLE_SIZE) {
    return { isPotentialDelay: false, currentStageDays, typicalStageDays: null, sampleSize: samples.length, confidencePercent: 0 };
  }

  const typicalStageDays = Math.round(samples.reduce((sum, d) => sum + d, 0) / samples.length);
  const isPotentialDelay = currentStageDays > typicalStageDays * DELAY_MULTIPLIER;
  // Confidence scales with sample size, capped — this is a heuristic
  // signal, never asserted as certain (spec §21).
  const confidencePercent = isPotentialDelay ? Math.min(80, 50 + samples.length * 6) : 0;

  return { isPotentialDelay, currentStageDays, typicalStageDays, sampleSize: samples.length, confidencePercent };
}
