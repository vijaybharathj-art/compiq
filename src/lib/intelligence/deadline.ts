import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_NOW } from "@/lib/constants";
import { createIntelligenceEvent } from "@/lib/pipeline/intelligence-events";

// Deadline Intelligence (PHASE4_DEAL_INTELLIGENCE.md §26-27, §64-65).
// Buckets and urgency labels operate on calendar days (deadlines are dates
// a client/counterparty gave, not business-day estimates like the
// Inactivity Engine's gap detection).

export type DeadlineBucket = "OVERDUE" | "TODAY" | "TOMORROW" | "THIS_WEEK" | "NEXT_WEEK" | "LATER";
export type DeadlineUrgency = "CRITICAL" | "HIGH" | "ATTENTION" | "NORMAL";

function daysUntil(dueDate: Date, now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function bucketDeadline(dueDate: Date, now: Date = DEMO_NOW): DeadlineBucket {
  const days = daysUntil(dueDate, now);
  if (days < 0) return "OVERDUE";
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  if (days <= 7) return "THIS_WEEK";
  if (days <= 14) return "NEXT_WEEK";
  return "LATER";
}

// Spec §64's worked table: 7 days → Normal, 3 days → Attention, tomorrow →
// High, today/overdue → Critical.
export function deadlineUrgency(dueDate: Date, now: Date = DEMO_NOW): DeadlineUrgency {
  const days = daysUntil(dueDate, now);
  if (days <= 0) return "CRITICAL";
  if (days === 1) return "HIGH";
  if (days <= 3) return "ATTENTION";
  return "NORMAL";
}

export interface DeadlinePriorityInput {
  dueDate: Date;
  dealValueMinorUnits?: bigint | number | null;
  dealPriority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  isExplicit: boolean;
  now?: Date;
}

/**
 * Deadline priority for display — distinct from Task.priority (set once at
 * task-creation time by src/lib/pipeline/generation.ts). This recomputes
 * live so it stays accurate as the due date approaches, and folds in deal
 * materiality per spec §27.
 */
export function computeDeadlinePriority(input: DeadlinePriorityInput): DeadlineUrgency {
  const urgency = deadlineUrgency(input.dueDate, input.now);
  const highValueDeal =
    (typeof input.dealValueMinorUnits === "bigint" || typeof input.dealValueMinorUnits === "number") &&
    Number(input.dealValueMinorUnits) / 100 >= 100_000_000;
  const highPriorityDeal = input.dealPriority === "HIGH" || input.dealPriority === "CRITICAL";

  if (urgency === "NORMAL" && (highValueDeal || highPriorityDeal) && input.isExplicit) {
    return "ATTENTION"; // an explicit deadline on a materially important deal still deserves a bump
  }
  return urgency;
}

const ESCALATION_REDETECTION_HOURS = 24;

/**
 * Escalation intelligence for overdue tasks on high-importance deals (spec
 * §65) — a separate pass from task creation itself. Skips tasks without a
 * matched deal (nothing to escalate against) and dedupes against a recent
 * escalation event for the same task.
 */
export async function runDeadlineScan(organizationId: string, now: Date = DEMO_NOW) {
  const { getPrismaClient } = await import("@/lib/db");
  const db: PrismaClient = getPrismaClient();

  const overdueTasks = await db.task.findMany({
    where: {
      organizationId,
      status: { in: ["TODO", "IN_PROGRESS"] },
      dueDate: { lt: now },
      dealId: { not: null },
    },
    include: { deal: { select: { id: true, projectCodename: true, priority: true, valueMinorUnits: true, enterpriseValueMinorUnits: true, clientId: true } } },
  });

  let escalatedCount = 0;
  for (const task of overdueTasks) {
    if (!task.deal) continue;
    const value = task.deal.enterpriseValueMinorUnits ?? task.deal.valueMinorUnits;
    const isHighImportance = task.deal.priority === "HIGH" || task.deal.priority === "CRITICAL" || (value !== null && Number(value) / 100 >= 100_000_000);
    if (!isHighImportance) continue;

    const recent = await db.intelligenceEvent.findFirst({
      where: {
        dealId: task.deal.id,
        eventType: "DEADLINE_DETECTED",
        headline: { startsWith: "Overdue task" },
        createdAt: { gte: new Date(now.getTime() - ESCALATION_REDETECTION_HOURS * 60 * 60 * 1000) },
      },
    });
    if (recent) continue;

    const daysOverdue = Math.abs(daysUntil(task.dueDate!, now));
    await createIntelligenceEvent(db, {
      organizationId,
      eventType: "DEADLINE_DETECTED",
      dealId: task.deal.id,
      clientId: task.deal.clientId ?? undefined,
      headline: `Overdue task: ${task.title}`,
      detail: `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue on ${task.deal.projectCodename}.`,
      occurredAt: now,
      requiresAction: true,
      deadlineDaysAway: -daysOverdue,
    });
    escalatedCount += 1;
  }

  return { checkedCount: overdueTasks.length, escalatedCount };
}
