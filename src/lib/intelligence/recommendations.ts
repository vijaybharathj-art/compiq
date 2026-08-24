import type { PrismaClient } from "@/generated/prisma/client";
import type { IntelligenceEventType } from "@/lib/pipeline/intelligence-events";

// TaskRecommendationService (PHASE4_DEAL_INTELLIGENCE.md §30-31). Every
// recommendation is a direct, templated mapping from an already-detected
// IntelligenceEvent — never a freestanding "generic advice" string — so
// the "WHY?" is always the event's own headline/detail plus its evidence
// chain (source email / deal), satisfying spec §31 without a second AI call.

export interface RecommendedAction {
  id: string;
  headline: string;
  reason: string;
  dealId?: string;
  dealCodename?: string;
  clientId?: string;
  sourceEventId: string;
  sourceEmailId?: string;
  importanceScore: number;
}

const RECOMMENDATION_TEMPLATES: Partial<Record<IntelligenceEventType, (headline: string, dealCodename: string) => string>> = {
  DEAL_INACTIVE: (_headline, codename) => `Follow up with the ${codename} client contact.`,
  RISK_DETECTED: (headline, codename) => `Review the ${codename} risk signal: ${headline}`,
  STAGE_CHANGED: (_headline, codename) => `Prepare materials for ${codename}'s next stage.`,
  DEADLINE_DETECTED: (headline, codename) => `${headline} — ${codename}.`,
  DEAL_VALUE_CHANGED: (_headline, codename) => `Review updated valuation on ${codename} against expectations.`,
  OPPORTUNITY_DETECTED: () => `Qualify the new opportunity signal before next contact.`,
};

const RECOMMENDATION_EVENT_TYPES = Object.keys(RECOMMENDATION_TEMPLATES) as IntelligenceEventType[];

/**
 * The same templated mapping generateRecommendedActions() uses, exposed for
 * callers (the dashboard's Top Priorities card) that already have an event
 * in hand and don't want a second query. Returns null for event types with
 * no recommendation template — callers should simply omit the "Recommended
 * action" line rather than fabricate generic advice (spec §31).
 */
export function recommendedActionText(eventType: IntelligenceEventType, headline: string, dealCodename: string): string | null {
  const template = RECOMMENDATION_TEMPLATES[eventType];
  return template ? template(headline, dealCodename) : null;
}

export async function generateRecommendedActions(
  db: PrismaClient,
  organizationId: string,
  options: { limit?: number; since?: Date } = {},
): Promise<RecommendedAction[]> {
  const events = await db.intelligenceEvent.findMany({
    where: {
      organizationId,
      eventType: { in: RECOMMENDATION_EVENT_TYPES },
      reviewStatus: { not: "DISMISSED" },
      ...(options.since ? { occurredAt: { gte: options.since } } : {}),
    },
    orderBy: [{ importanceScore: "desc" }, { occurredAt: "desc" }],
    take: options.limit ?? 10,
    include: { deal: { select: { id: true, projectCodename: true } } },
  });

  return events
    .filter((e) => e.eventType && e.deal)
    .map((event) => {
      const template = RECOMMENDATION_TEMPLATES[event.eventType as IntelligenceEventType]!;
      return {
        id: `rec-${event.id}`,
        headline: template(event.headline, event.deal!.projectCodename),
        reason: event.detail ?? event.headline,
        dealId: event.deal!.id,
        dealCodename: event.deal!.projectCodename,
        clientId: event.clientId ?? undefined,
        sourceEventId: event.id,
        sourceEmailId: event.sourceEmailId ?? undefined,
        importanceScore: event.importanceScore ?? 0,
      };
    });
}
