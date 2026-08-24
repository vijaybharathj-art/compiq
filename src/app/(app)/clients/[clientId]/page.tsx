import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientEngagements } from "@/components/clients/client-engagements";
import {
  ClientContactsPanel,
  ClientFactsPanel,
  ClientOpportunitiesPanel,
} from "@/components/clients/client-side-panels";
import { IntelligenceFeedItem } from "@/components/intelligence/feed-item";
import { EmptyState } from "@/components/shared/empty-state";
import { clientRepository } from "@/lib/data";
import { computeRelationshipInsights } from "@/lib/insights";
import { computeClientAttention } from "@/lib/intelligence/client-attention";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { Radar, Sparkles, Target } from "lucide-react";

const relationshipVariant = {
  ACTIVE: "positive",
  PROSPECT: "outline",
  DORMANT: "warning",
  FORMER: "default",
} as const;

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await clientRepository.get(clientId);
  if (!client) notFound();
  const insights = computeRelationshipInsights(client);
  const attentionEntries = await computeClientAttention(getPrismaClient(), DEMO_ORG_ID);
  const attention = attentionEntries.find((a) => a.clientId === clientId);

  return (
    <div className="pb-10">
      <div className="border-b border-border px-8 py-5">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          All clients
        </Link>
        <div className="mt-3 flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight">{client.name}</h1>
          <Badge variant={relationshipVariant[client.relationshipStatus]}>
            {client.relationshipStatus.charAt(0) + client.relationshipStatus.slice(1).toLowerCase()}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.sectorName} · {client.headquarters}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 px-8 pt-6 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card className="gap-0">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle>Current & Historical Engagements</CardTitle>
            </CardHeader>
            <ClientEngagements deals={client.deals} />
          </Card>

          <Card className="gap-0">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle>Recent Communications & Intelligence</CardTitle>
            </CardHeader>
            {client.recentIntelligence.length === 0 ? (
              <div className="px-5 py-6">
                <EmptyState icon={Radar} title="No recent activity detected" />
              </div>
            ) : (
              <div>
                {client.recentIntelligence.map((item) => (
                  <IntelligenceFeedItem key={item.id} item={item} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-1">
              <Sparkles className="size-4 text-accent" />
              <CardTitle>Relationship Intelligence</CardTitle>
            </CardHeader>
            <ul className="flex flex-col gap-2 px-5 pb-4 pt-1">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
                  {insight}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-1">
              <Target className="size-4 text-accent" />
              <CardTitle>Client Attention</CardTitle>
            </CardHeader>
            {attention ? (
              <div className="flex flex-col gap-2 px-5 pb-4 pt-1 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>{attention.activeDealCount} active deal{attention.activeDealCount === 1 ? "" : "s"}</span>
                  {attention.inactiveDealCount > 0 && <span>{attention.inactiveDealCount} inactive</span>}
                  {attention.upcomingDeadlineCount > 0 && <span>{attention.upcomingDeadlineCount} deadline{attention.upcomingDeadlineCount === 1 ? "" : "s"} this week</span>}
                  {attention.openOpportunityCount > 0 && <span>{attention.openOpportunityCount} open opportunit{attention.openOpportunityCount === 1 ? "y" : "ies"}</span>}
                </div>
                <p className="font-medium text-foreground">{attention.recommendedAction}</p>
              </div>
            ) : (
              <p className="px-5 pb-4 pt-1 text-sm text-muted-foreground">No attention items right now.</p>
            )}
          </Card>
          <ClientFactsPanel client={client} />
          <ClientContactsPanel client={client} />
          <ClientOpportunitiesPanel client={client} />
        </div>
      </div>
    </div>
  );
}
