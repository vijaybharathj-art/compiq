import { PageHeader } from "@/components/shared/page-header";
import { MorningBriefing } from "@/components/dashboard/morning-briefing";
import { ActionRequiredCard } from "@/components/dashboard/action-required";
import { NewOpportunitiesCard } from "@/components/dashboard/new-opportunities";
import { SinceLastScanCard } from "@/components/dashboard/since-last-scan";
import { TopPrioritiesCard } from "@/components/dashboard/top-priorities";
import { RisksCard } from "@/components/dashboard/risks-card";
import { DeadlinesCard } from "@/components/dashboard/deadlines-card";
import { MomentumSummaryCard } from "@/components/dashboard/momentum-summary";
import { ClientAttentionSummaryCard } from "@/components/dashboard/client-attention-summary";
import { IntelligenceFeedItem } from "@/components/intelligence/feed-item";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { dashboardRepository } from "@/lib/data";
import { auth } from "@/lib/auth/config";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { getWhatChangedSince } from "@/lib/intelligence/feed";
import { getPendingEmailCount } from "@/lib/pipeline/queries";
import { Sparkles } from "lucide-react";
import Link from "next/link";

// Intelligence-first dashboard (PHASE4_5_PRODUCTION_HARDENING.md — spec
// §4-6): Good Morning → stat bar → Top Priorities → What Changed →
// Deadlines → Deal Momentum → Client Attention. The generic six-tile CRM
// stat grid this page used to open with is gone on purpose — it's exactly
// the "feels like a generic CRM dashboard" the spec calls out (§4); the
// three numbers that matter (deals changed / require attention / value
// affected) live in the stat bar instead.
export default async function DashboardPage() {
  const db = getPrismaClient();

  const [data, session, lastJob, pendingCount] = await Promise.all([
    dashboardRepository.get(),
    auth(),
    db.emailProcessingJob.findFirst({ where: { organizationId: DEMO_ORG_ID, status: "COMPLETED" }, orderBy: { finishedAt: "desc" } }),
    getPendingEmailCount(DEMO_ORG_ID),
  ]);
  const firstName = (session?.user?.name ?? session?.user?.email ?? "there").split(" ")[0]!;
  const windowStart = lastJob?.finishedAt ?? new Date(DEMO_NOW.getTime() - 1000 * 60 * 60 * 24);
  const stats = await getWhatChangedSince(db, DEMO_ORG_ID, windowStart);

  const priorityDeals = Array.from(
    new Map(stats.topEvents.filter((e) => e.deal).map((e) => [e.deal!.id, { id: e.deal!.id, projectCodename: e.deal!.projectCodename }])).values(),
  );

  return (
    <div className="pb-10">
      <PageHeader title="Dashboard" description="Your deal intelligence briefing — what changed, what matters, what to do next." />

      <MorningBriefing data={data} firstName={firstName} />

      <div className="px-8 pt-6">
        <SinceLastScanCard stats={stats} pendingCount={pendingCount} windowStart={windowStart} />
      </div>

      <div className="mt-4 px-8">
        <TopPrioritiesCard events={stats.topEvents} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 px-8 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="gap-0">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle>What Changed</CardTitle>
              <CardAction>
                <Link href="/intelligence" className="text-xs text-accent hover:underline">
                  Open full feed
                </Link>
              </CardAction>
            </CardHeader>
            <div>
              {data.todaysIntelligence.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    icon={Sparkles}
                    title="No material changes"
                    description="Tattava hasn't detected any material deal changes since your last briefing."
                  />
                </div>
              ) : (
                data.todaysIntelligence.map((item) => <IntelligenceFeedItem key={item.id} item={item} />)
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <DeadlinesCard />
          <RisksCard />
          <MomentumSummaryCard deals={priorityDeals} />
          <ClientAttentionSummaryCard />
          <ActionRequiredCard tasks={data.actionRequired} />
          <NewOpportunitiesCard opportunities={data.newOpportunities} />
        </div>
      </div>
    </div>
  );
}
