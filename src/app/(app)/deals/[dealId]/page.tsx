import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriorityPill, RiskPill, ConfidenceBadge } from "@/components/shared/badges";
import { StageProgress } from "@/components/deals/stage-progress";
import { DealTimeline } from "@/components/deals/deal-timeline";
import {
  DealFactsPanel,
  DealParticipantsPanel,
  DealTeamPanel,
} from "@/components/deals/deal-facts";
import { DealTasksList } from "@/components/deals/deal-tasks-list";
import { DealEmailsList } from "@/components/deals/deal-emails-list";
import { DealIntelligencePanel } from "@/components/deals/deal-intelligence-panel";
import { DealIntelligenceOverviewPanel } from "@/components/deals/deal-intelligence-overview";
import { dealRepository } from "@/lib/data";
import { getBankingService } from "@/lib/data/fixtures/workflows";
import { formatDate, formatEnumLabel, formatMoney } from "@/lib/format";
import { getDealIntelligenceOverview } from "@/lib/intelligence/deal-overview";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const deal = await dealRepository.get(dealId);
  if (!deal) notFound();
  // dealRepository.get() (Phase 1) reads by id alone with no organization
  // filter — this check closes that gap for the Phase 4.5 intelligence
  // panel specifically (spec §57) without touching the Phase 1 repository
  // layer itself. A deal id from another organization now 404s like any
  // other nonexistent deal, rather than rendering another org's data.
  const db = getPrismaClient();
  const belongsToOrg = await db.deal.count({ where: { id: dealId, organizationId: DEMO_ORG_ID } });
  if (!belongsToOrg) notFound();
  const overview = await getDealIntelligenceOverview(db, dealId, DEMO_ORG_ID);

  return (
    <div className="pb-10">
      <div className="border-b border-border px-8 py-5">
        <Link
          href="/deals"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          All deals
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{deal.projectCodename}</h1>
              <Badge variant="accent">{getBankingService(deal.bankingServiceId).name}</Badge>
              <PriorityPill priority={deal.priority} />
              <RiskPill status={deal.riskStatus} note={deal.riskNote} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={`/clients/${deal.clientId}`} className="hover:text-accent">
                {deal.clientName}
              </Link>
              {deal.targetCompanyName && <> · {deal.targetCompanyName}</>} · {formatEnumLabel(deal.dealType)}
            </p>
          </div>

          <div className="flex items-center gap-6 text-right">
            <div>
              <p className="text-xs text-muted-foreground">Enterprise Value</p>
              <p className="text-lg font-semibold tabular-nums text-gold">
                {formatMoney(deal.enterpriseValue ?? deal.value)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expected Close</p>
              <p className="text-lg font-semibold tabular-nums">{formatDate(deal.expectedCloseDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI Confidence</p>
              <div className="mt-0.5">
                <ConfidenceBadge percent={deal.aiConfidencePercent} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <StageProgress stages={deal.workflowStages} currentStageKey={deal.currentStageKey} />
        </div>
      </div>

      <div className="px-8 pt-6">
        <DealIntelligenceOverviewPanel dealId={dealId} overview={overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 px-8 pt-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="tasks">
                Tasks
                {deal.tasks.length > 0 && (
                  <span className="ml-1 rounded-full bg-surface-raised px-1.5 text-[10px] tabular-nums">
                    {deal.tasks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="emails">
                Emails
                {deal.emails.length > 0 && (
                  <span className="ml-1 rounded-full bg-surface-raised px-1.5 text-[10px] tabular-nums">
                    {deal.emails.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="timeline">
              <Card className="gap-0 py-4">
                <DealTimeline events={deal.timeline} />
              </Card>
            </TabsContent>
            <TabsContent value="tasks">
              <Card className="gap-0">
                <DealTasksList tasks={deal.tasks} />
              </Card>
            </TabsContent>
            <TabsContent value="emails">
              <Card className="gap-0">
                <DealEmailsList emails={deal.emails} />
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-4">
          <DealIntelligencePanel deal={deal} />
          <DealFactsPanel deal={deal} />
          <DealTeamPanel deal={deal} />
          <DealParticipantsPanel deal={deal} />
        </div>
      </div>
    </div>
  );
}
