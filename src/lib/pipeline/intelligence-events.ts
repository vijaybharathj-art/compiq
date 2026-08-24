import type { PrismaClient } from "@/generated/prisma/client";

// Intelligence event model (spec §23). One helper, used by every other
// stage that surfaces a signal (change detection, task/meeting generation,
// risk/opportunity detection) — keeps the eventType → category mapping in
// exactly one place instead of duplicated per call site.

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
}

export async function createIntelligenceEvent(db: PrismaClient, input: CreateIntelligenceEventInput) {
  return db.intelligenceEvent.create({
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
      sourceEmailId: input.sourceEmailId,
      aiExtractionId: input.aiExtractionId,
      processingJobId: input.processingJobId,
      occurredAt: input.occurredAt,
    },
  });
}
