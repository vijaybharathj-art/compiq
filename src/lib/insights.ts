import { getBankingService } from "@/lib/data/fixtures/workflows";
import { daysSince } from "@/lib/format";
import type { ClientDetail } from "@/lib/data";

const DEMO_NOW = new Date("2026-08-23T18:00:00Z");

/**
 * Client Intelligence bullets (PRODUCT_SPEC.md §21 / execution brief §14):
 * computed from the client's own deals/opportunities/intelligence — never
 * hardcoded strings.
 */
export function computeRelationshipInsights(client: ClientDetail): string[] {
  const insights: string[] = [];

  const recentActivityCount = client.recentIntelligence.filter(
    (i) => daysSince(i.occurredAt, DEMO_NOW) <= 30,
  ).length;
  if (recentActivityCount >= 3) {
    insights.push("Client has been highly active over the last 30 days.");
  } else if (recentActivityCount >= 1) {
    insights.push("Client has had some activity over the last 30 days.");
  } else {
    insights.push("No client activity detected in the last 30 days.");
  }

  const activeByService = new Map<string, number>();
  for (const deal of client.deals) {
    if (deal.currentStageKey === "closing") continue;
    activeByService.set(deal.bankingServiceId, (activeByService.get(deal.bankingServiceId) ?? 0) + 1);
  }
  for (const [serviceId, count] of activeByService) {
    const serviceName = getBankingService(serviceId as Parameters<typeof getBankingService>[0]).name;
    insights.push(
      `Client currently has ${count} active ${serviceName} ${count === 1 ? "discussion" : "discussions"}.`,
    );
  }

  const newOpportunities = client.opportunities.filter((o) => o.status === "NEW");
  for (const opp of newOpportunities) {
    const serviceName = getBankingService(opp.potentialServiceId).name;
    insights.push(`Potential ${serviceName} opportunity detected.`);
  }

  if (client.relationshipStatus === "DORMANT") {
    insights.push("Relationship is currently dormant — consider a re-engagement outreach.");
  }

  return insights;
}
