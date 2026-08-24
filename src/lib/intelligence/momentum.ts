import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_NOW } from "@/lib/constants";
import { getOpenRisksForDeal } from "./risk-engine";

// MomentumService (PHASE4_DEAL_INTELLIGENCE.md §33-34, §61). Deliberately
// kept distinct from the Risk Engine's riskScore: momentum answers "how
// active/progressive does this deal look," risk answers "how many
// concerning signals exist." A deal can be simultaneously high-momentum
// and moderately risky (spec §61's worked example). Always labeled
// OPERATIONAL MOMENTUM in the UI — never framed as probability of closing.

export type MomentumTrend = "IMPROVING" | "STABLE" | "WEAKENING" | "STALLED";

export interface MomentumAssessment {
  score: number;
  trend: MomentumTrend;
  reasons: string[];
}

const RECENT_ACTIVITY_WINDOW_DAYS = 14;
const TREND_WINDOW_DAYS = 7;

export async function computeMomentum(db: PrismaClient, dealId: string, now: Date = DEMO_NOW): Promise<MomentumAssessment> {
  const windowStart = new Date(now.getTime() - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const trendMidpoint = new Date(now.getTime() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const trendWindowStart = new Date(now.getTime() - 2 * TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [recentEvents, recentWeekEvents, priorWeekEvents, stageChangedRecently, tasks, openRisks] = await Promise.all([
    db.intelligenceEvent.count({ where: { dealId, occurredAt: { gte: windowStart } } }),
    db.intelligenceEvent.count({ where: { dealId, occurredAt: { gte: trendMidpoint } } }),
    db.intelligenceEvent.count({ where: { dealId, occurredAt: { gte: trendWindowStart, lt: trendMidpoint } } }),
    db.dealEvent.findFirst({ where: { dealId, type: "STAGE_CHANGE", occurredAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } } }),
    db.task.findMany({ where: { dealId }, select: { status: true, dueDate: true } }),
    getOpenRisksForDeal(db, dealId),
  ]);

  const activityScore = Math.min(30, recentEvents * 5);
  const stageScore = stageChangedRecently ? 20 : 0;

  const relevantTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "TODO" || t.status === "IN_PROGRESS");
  const completedCount = relevantTasks.filter((t) => t.status === "COMPLETED").length;
  const completionScore = relevantTasks.length === 0 ? 20 : Math.round((completedCount / relevantTasks.length) * 20);

  const overdueCount = tasks.filter((t) => t.status !== "COMPLETED" && t.dueDate && t.dueDate < now).length;
  const deadlineScore = overdueCount === 0 ? 15 : Math.max(0, 15 - overdueCount * 5);

  const baseFloor = 15;
  const riskPenalty = Math.min(30, openRisks.length * 8);

  const score = Math.max(0, Math.min(100, activityScore + stageScore + completionScore + deadlineScore + baseFloor - riskPenalty));

  let trend: MomentumTrend;
  if (openRisks.length >= 2 && recentWeekEvents === 0) {
    trend = "STALLED";
  } else if (recentWeekEvents > priorWeekEvents) {
    trend = "IMPROVING";
  } else if (recentWeekEvents < priorWeekEvents && openRisks.length > 0) {
    trend = "WEAKENING";
  } else {
    trend = "STABLE";
  }

  const reasons: string[] = [];
  if (trend === "WEAKENING" || trend === "STALLED") {
    for (const risk of openRisks.slice(0, 3)) reasons.push(risk.description);
    if (overdueCount > 0) reasons.push(`${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`);
  } else if (trend === "IMPROVING") {
    if (stageChangedRecently) reasons.push("Recent stage advancement");
    if (recentWeekEvents > 0) reasons.push(`${recentWeekEvents} event${recentWeekEvents === 1 ? "" : "s"} this week`);
  }

  return { score, trend, reasons };
}
