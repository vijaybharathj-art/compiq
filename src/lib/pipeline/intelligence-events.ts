import type { PrismaClient } from "@/generated/prisma/client";
import { computeImportanceScore, type RiskSeverityInput } from "@/lib/intelligence/importance";

// Intelligence event model (spec §23). One helper, used by every other
// stage that surfaces a signal (change detection, task/meeting generation,
// risk/opportunity detection) — keeps the eventType → category mapping in
// exactly one place instead of duplicated per call site. Also the single
// place importanceScore is computed (PHASE4_DEAL_INTELLIGENCE.md §5), so
// every event gets a score without every call site re-deriving deal
// materiality/priority itself.

export type IntelligenceEventType =
  | "DEAL_CREATED"
  | "DEAL_VALUE_CHANGED"
  | "STAGE_CHANGED"
  | "BUYER_ADDED"
  | "BUYER_REMOVED"
  | "MANDATE_CHANGED"
  | "DEADLINE_DETECTED"
  | "TASK_CREATED"
  | "RISK_DETECTED"
  | "OPPORTUNITY_DETECTED"
  | "CLIENT_ACTIVITY"
  | "IMPORTANT_EMAIL"
  | "DEAL_INACTIVE";

const CATEGORY_BY_EVENT_TYPE: Record<
  IntelligenceEventType,
  "DEAL_CHANGE" | "CLIENT_ACTIVITY" | "TASK" | "OPPORTUNITY" | "RISK" | "IMPORTANT_EMAIL"
> = {
  DEAL_CREATED: "DEAL_CHANGE",
  DEAL_VALUE_CHANGED: "DEAL_CHANGE",
  STAGE_CHANGED: "DEAL_CHANGE",
  BUYER_ADDED: "DEAL_CHANGE",
  BUYER_REMOVED: "DEAL_CHANGE",
  MANDATE_CHANGED: "DEAL_CHANGE",
  DEADLINE_DETECTED: "TASK",
  TASK_CREATED: "TASK",
  RISK_DETECTED: "RISK",
  OPPORTUNITY_DETECTED: "OPPORTUNITY",
  CLIENT_ACTIVITY: "CLIENT_ACTIVITY",
  IMPORTANT_EMAIL: "IMPORTANT_EMAIL",
  DEAL_INACTIVE: "RISK",
};

// Event types where the banker is implicitly expected to do something
// about it, absent a call site overriding requiresAction explicitly.
const ACTION_IMPLIED_EVENT_TYPES = new Set<IntelligenceEventType>([
  "RISK_DETECTED",
  "DEAL_INACTIVE",
  "DEADLINE_DETECTED",
  "TASK_CREATED",
]);

export interface CreateIntelligenceEventInput {
  organizationId: string;
  eventType: IntelligenceEventType;
  dealId?: string;
  clientId?: string;
  headline: string;
  detail?: string;
  deltaFrom?: string;
  deltaTo?: string;
  confidencePercent?: number;
  sourceEmailId?: string;
  aiExtractionId?: string;
  processingJobId?: string;
  occurredAt: Date;
  /** Overrides the ACTION_IMPLIED_EVENT_TYPES default for importance scoring. */
  requiresAction?: boolean;
  deadlineDaysAway?: number;
  riskSeverity?: RiskSeverityInput;
}

// Event types where the same email being (re-)processed could otherwise
// generate a second, identical row — deduplicated on
// (sourceEmailId, eventType, deltaFrom, deltaTo) per spec §47.
const DEDUPE_ON_SOURCE_EMAIL = new Set<IntelligenceEventType>([
  "STAGE_CHANGED",
  "DEAL_VALUE_CHANGED",
  "MANDATE_CHANGED",
]);

export async function createIntelligenceEvent(db: PrismaClient, input: CreateIntelligenceEventInput) {
  if (input.sourceEmailId && DEDUPE_ON_SOURCE_EMAIL.has(input.eventType)) {
    const existing = await db.intelligenceEvent.findFirst({
      where: {
        sourceEmailId: input.sourceEmailId,
        eventType: input.eventType,
        deltaFrom: input.deltaFrom ?? null,
        deltaTo: input.deltaTo ?? null,
      },
    });
    if (existing) return existing;
  }

  let dealValueMinorUnits: bigint | null = null;
  let dealPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null = null;
  let leadBankerId: string | null = null;
  if (input.dealId) {
    const deal = await db.deal.findUnique({
      where: { id: input.dealId },
      select: { enterpriseValueMinorUnits: true, valueMinorUnits: true, priority: true, leadBankerId: true },
    });
    if (deal) {
      dealValueMinorUnits = deal.enterpriseValueMinorUnits ?? deal.valueMinorUnits;
      dealPriority = deal.priority;
      leadBankerId = deal.leadBankerId;
    }
  }

  const importanceScore = computeImportanceScore({
    eventType: input.eventType,
    dealValueMinorUnits,
    dealPriority,
    confidencePercent: input.confidencePercent,
    requiresAction: input.requiresAction ?? ACTION_IMPLIED_EVENT_TYPES.has(input.eventType),
    deadlineDaysAway: input.deadlineDaysAway,
    riskSeverity: input.riskSeverity,
    occurredAt: input.occurredAt,
  });

  const event = await db.intelligenceEvent.create({
    data: {
      organizationId: input.organizationId,
      category: CATEGORY_BY_EVENT_TYPE[input.eventType],
      eventType: input.eventType,
      dealId: input.dealId,
      clientId: input.clientId,
      headline: input.headline,
      detail: input.detail,
      deltaFrom: input.deltaFrom,
      deltaTo: input.deltaTo,
      confidencePercent: input.confidencePercent,
      importanceScore,
      sourceEmailId: input.sourceEmailId,
      aiExtractionId: input.aiExtractionId,
      processingJobId: input.processingJobId,
      occurredAt: input.occurredAt,
    },
  });

  // Only CRITICAL/HIGH-importance events notify (spec §53) — never every
  // low-value event — and only when there's a deal lead banker to notify.
  if (importanceScore >= 75 && leadBankerId) {
    await db.notification.create({
      data: {
        userId: leadBankerId,
        type: input.eventType,
        title: input.headline,
        body: input.detail,
        linkHref: input.dealId ? `/deals/${input.dealId}` : undefined,
        priority: importanceScore >= 90 ? "CRITICAL" : "HIGH",
      },
    });
  }

  return event;
}
