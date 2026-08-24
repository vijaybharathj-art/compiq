import type { PrismaClient } from "@/generated/prisma/client";
import type { ExtractionResult } from "@/lib/ai/extraction-schema";
import type { DealMatchDecision } from "./matching";
import { createIntelligenceEvent } from "./intelligence-events";
import { recordRisk } from "@/lib/intelligence/risk-engine";
import { touchMeaningfulActivity } from "@/lib/intelligence/inactivity";
import type { ScanCounters } from "./types";

// Task generation, meeting detection, risk detection, and opportunity
// detection stages (spec §19-22). Four small, independent functions the
// orchestrator calls unconditionally per relevant email — they don't
// depend on a concrete deal change having been detected, since a risk
// signal or a deadline can matter even when nothing else changed.

export interface GenerationContext {
  organizationId: string;
  emailId: string;
  dealId: string | null;
  clientId: string | null;
  extraction: ExtractionResult;
  processingJobId: string;
  occurredAt: Date;
}

function priorityForDeadline(normalizedDate: string | null, occurredAt: Date): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (!normalizedDate) return "MEDIUM";
  const days = (new Date(normalizedDate).getTime() - occurredAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 1) return "HIGH";
  if (days <= 3) return "MEDIUM";
  return "LOW";
}

export async function generateTasks(db: PrismaClient, ctx: GenerationContext, counters: ScanCounters): Promise<void> {
  if (ctx.extraction.actions.length === 0) return;

  for (const action of ctx.extraction.actions) {
    const task = await db.task.create({
      data: {
        organizationId: ctx.organizationId,
        dealId: ctx.dealId ?? undefined,
        clientId: ctx.clientId ?? undefined,
        title: action.charAt(0).toUpperCase() + action.slice(1),
        description: `Detected from an incoming email: "${ctx.extraction.evidence.quotedExcerpt.slice(0, 160)}"`,
        priority: priorityForDeadline(ctx.extraction.deadline?.normalizedDate ?? null, ctx.occurredAt),
        dueDate: ctx.extraction.deadline?.normalizedDate ? new Date(ctx.extraction.deadline.normalizedDate) : undefined,
        deadlineSourceText: ctx.extraction.deadline?.originalText,
        status: "TODO",
        sourceEmailId: ctx.emailId,
        aiConfidencePercent: ctx.extraction.confidencePercent,
      },
    });
    counters.tasksCreated += 1;

    await createIntelligenceEvent(db, {
      organizationId: ctx.organizationId,
      eventType: "TASK_CREATED",
      dealId: ctx.dealId ?? undefined,
      clientId: ctx.clientId ?? undefined,
      headline: `New task: ${task.title}`,
      detail: ctx.extraction.deadline ? `Due: ${ctx.extraction.deadline.originalText}` : undefined,
      confidencePercent: ctx.extraction.confidencePercent,
      sourceEmailId: ctx.emailId,
      processingJobId: ctx.processingJobId,
      occurredAt: ctx.occurredAt,
    });
  }

  if (ctx.extraction.deadline && ctx.extraction.actions.length === 0) {
    // A deadline with no explicit action still deserves a feed entry
    // (spec §23's DEADLINE_DETECTED type) even though no task was created.
    await createIntelligenceEvent(db, {
      organizationId: ctx.organizationId,
      eventType: "DEADLINE_DETECTED",
      dealId: ctx.dealId ?? undefined,
      clientId: ctx.clientId ?? undefined,
      headline: `Deadline detected: ${ctx.extraction.deadline.originalText}`,
      detail: ctx.extraction.deadline.normalizedDate ?? "Date could not be confidently normalized",
      confidencePercent: ctx.extraction.deadline.confidencePercent,
      sourceEmailId: ctx.emailId,
      processingJobId: ctx.processingJobId,
      occurredAt: ctx.occurredAt,
    });
  }
}

export async function generateMeetings(db: PrismaClient, ctx: GenerationContext): Promise<void> {
  if (!ctx.dealId || ctx.extraction.meetings.length === 0) return;

  for (const meeting of ctx.extraction.meetings) {
    const startsAt = meeting.normalizedDate ? new Date(meeting.normalizedDate) : ctx.occurredAt;
    await db.meeting.create({
      data: {
        dealId: ctx.dealId,
        title: meetingTitle(meeting.type),
        startsAt,
        attendees: [],
        sourceEmailId: ctx.emailId,
      },
    });
    await db.dealEvent.create({
      data: {
        dealId: ctx.dealId,
        type: "MILESTONE",
        newValue: meetingTitle(meeting.type),
        occurredAt: ctx.occurredAt,
        sourceEmailId: ctx.emailId,
        note: meeting.normalizedDate ? `Scheduled for ${meeting.normalizedDate}.` : `Timing: "${meeting.originalText}".`,
      },
    });
    await touchMeaningfulActivity(db, ctx.dealId, ctx.occurredAt);
  }
}

function meetingTitle(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export async function generateRiskEvents(db: PrismaClient, ctx: GenerationContext, counters: ScanCounters): Promise<void> {
  if (ctx.extraction.riskSignals.length === 0) return;

  for (const risk of ctx.extraction.riskSignals) {
    const confidencePercent = Math.min(85, ctx.extraction.confidencePercent);

    const event = await createIntelligenceEvent(db, {
      organizationId: ctx.organizationId,
      eventType: "RISK_DETECTED",
      dealId: ctx.dealId ?? undefined,
      clientId: ctx.clientId ?? undefined,
      headline: risk,
      confidencePercent,
      sourceEmailId: ctx.emailId,
      processingJobId: ctx.processingJobId,
      occurredAt: ctx.occurredAt,
    });

    if (ctx.dealId) {
      const { severity, momentumWeakening } = await recordRisk(db, {
        organizationId: ctx.organizationId,
        dealId: ctx.dealId,
        signalText: risk,
        confidencePercent,
        sourceEmailId: ctx.emailId,
        intelligenceEventId: event.id,
        detectedAt: ctx.occurredAt,
      });

      const nextRiskStatus = severity === "HIGH" || severity === "CRITICAL" ? "AT_RISK" : "WATCH";
      await db.deal
        .update({
          where: { id: ctx.dealId },
          data: {
            riskStatus: nextRiskStatus,
            riskNote: momentumWeakening ? "Deal momentum weakening — multiple recent risk signals." : risk,
          },
        })
        .catch(() => {
          // Non-fatal: leave riskStatus untouched on a transient conflict.
        });

      await db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: null,
          action: "Risk detected",
          entityType: "Risk",
          entityId: event.id,
          metadata: { dealId: ctx.dealId, severity, momentumWeakening },
        },
      });
    }
    counters.risksDetected += 1;
  }
}

export async function generateOpportunity(
  db: PrismaClient,
  ctx: GenerationContext,
  matchDecision: DealMatchDecision,
  counters: ScanCounters,
): Promise<void> {
  if (matchDecision.matchType !== "POTENTIAL_OPPORTUNITY" || !ctx.clientId) return;

  const service = ctx.extraction.bankingService
    ? await db.bankingService.findFirst({ where: { code: ctx.extraction.bankingService } })
    : null;
  const fallbackService = service ?? (await db.bankingService.findFirst({ where: { code: "OTHER" } }));
  if (!fallbackService) return;

  const opportunity = await db.opportunity.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      potentialServiceId: fallbackService.id,
      signalText: ctx.extraction.opportunitySignalText ?? "Potential opportunity detected.",
      confidencePercent: matchDecision.confidencePercent,
      recommendedAction: "Review and confirm with the client before creating a mandate.",
      status: "NEW",
      sourceEmailId: ctx.emailId,
    },
  });
  counters.opportunitiesCreated += 1;

  await createIntelligenceEvent(db, {
    organizationId: ctx.organizationId,
    eventType: "OPPORTUNITY_DETECTED",
    clientId: ctx.clientId,
    headline: "New potential opportunity",
    detail: opportunity.signalText,
    confidencePercent: matchDecision.confidencePercent,
    sourceEmailId: ctx.emailId,
    processingJobId: ctx.processingJobId,
    occurredAt: ctx.occurredAt,
  });
}
