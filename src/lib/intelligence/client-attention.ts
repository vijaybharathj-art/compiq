import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_NOW } from "@/lib/constants";
import { assessInactiveDeals } from "./inactivity";

// ClientAttentionService (PHASE4_DEAL_INTELLIGENCE.md §32). Aggregates
// deal-level and task-level signals up to the client, so a banker sees
// relationship-level attention needs rather than having to notice the
// pattern across several separate deal pages.

export interface ClientAttentionEntry {
  clientId: string;
  clientName: string;
  activeDealCount: number;
  inactiveDealCount: number;
  upcomingDeadlineCount: number;
  openOpportunityCount: number;
  /** The individual grounded reasons behind recommendedAction (spec §26's bulleted "Reasons:" list). */
  reasons: string[];
  recommendedAction: string;
}

const UPCOMING_DEADLINE_WINDOW_DAYS = 7;

export async function computeClientAttention(db: PrismaClient, organizationId: string): Promise<ClientAttentionEntry[]> {
  const [clients, inactiveAssessments] = await Promise.all([
    db.client.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        deals: { where: { currentStage: { key: { not: "closing" } } }, select: { id: true } },
      },
    }),
    assessInactiveDeals(db, organizationId),
  ]);

  const inactiveDealIds = new Set(inactiveAssessments.filter((a) => !a.exempt).map((a) => a.dealId));
  const now = DEMO_NOW;
  const windowEnd = new Date(now.getTime() + UPCOMING_DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const results: ClientAttentionEntry[] = [];
  for (const client of clients) {
    if (client.deals.length === 0) continue;
    const dealIds = client.deals.map((d) => d.id);

    const [upcomingDeadlineCount, openOpportunityCount] = await Promise.all([
      db.task.count({
        where: { dealId: { in: dealIds }, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { gte: now, lte: windowEnd } },
      }),
      db.opportunity.count({ where: { clientId: client.id, status: { in: ["NEW", "ACKNOWLEDGED"] } } }),
    ]);

    const inactiveDealCount = client.deals.filter((d) => inactiveDealIds.has(d.id)).length;
    const flagged = inactiveDealCount > 0 || upcomingDeadlineCount >= 2 || openOpportunityCount > 0 || client.deals.length >= 3;
    if (!flagged) continue;

    const reasons: string[] = [];
    if (inactiveDealCount > 0) reasons.push(`${inactiveDealCount} inactive deal${inactiveDealCount === 1 ? "" : "s"}`);
    if (upcomingDeadlineCount > 0) reasons.push(`${upcomingDeadlineCount} deadline${upcomingDeadlineCount === 1 ? "" : "s"} this week`);
    if (openOpportunityCount > 0) reasons.push(`${openOpportunityCount} open opportunit${openOpportunityCount === 1 ? "y" : "ies"}`);

    results.push({
      clientId: client.id,
      clientName: client.name,
      activeDealCount: client.deals.length,
      inactiveDealCount,
      upcomingDeadlineCount,
      openOpportunityCount,
      reasons,
      recommendedAction:
        inactiveDealCount > 0
          ? "Schedule a relationship call."
          : reasons.length > 0
            ? `Review: ${reasons.join(", ")}.`
            : "Review recent activity.",
    });
  }

  return results.sort((a, b) => b.inactiveDealCount - a.inactiveDealCount || b.activeDealCount - a.activeDealCount);
}
