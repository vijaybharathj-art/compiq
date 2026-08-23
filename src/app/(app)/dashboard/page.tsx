import {
  Briefcase,
  DollarSign,
  TrendingUp,
  TriangleAlert,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { MorningBriefing } from "@/components/dashboard/morning-briefing";
import { ActionRequiredCard } from "@/components/dashboard/action-required";
import { NewOpportunitiesCard } from "@/components/dashboard/new-opportunities";
import { IntelligenceFeedItem } from "@/components/intelligence/feed-item";
import { Card, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { dashboardRepository, CURRENT_USER_ID } from "@/lib/data";
import { bankers } from "@/lib/data/fixtures/bankers";
import { formatMoney } from "@/lib/format";
import Link from "next/link";

export default async function DashboardPage() {
  const data = await dashboardRepository.get();
  const currentUser = bankers.find((b) => b.id === CURRENT_USER_ID)!;

  return (
    <div className="pb-10">
      <PageHeader
        title="Dashboard"
        description="Your portfolio at a glance — what changed, what needs attention, what's next."
      />

      <MorningBriefing data={data} firstName={currentUser.name.split(" ")[0]} />

      <div className="grid grid-cols-2 gap-3 px-8 pt-6 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Active Deals" value={String(data.stats.activeDeals)} icon={Briefcase} />
        <StatTile
          label="Total Deal Value"
          value={formatMoney({ amountMinorUnits: data.stats.totalDealValueMinorUnits, currency: "USD" })}
          icon={DollarSign}
        />
        <StatTile
          label="Requiring Attention"
          value={String(data.stats.dealsRequiringAttention)}
          icon={TriangleAlert}
          tone="warning"
        />
        <StatTile
          label="New Opportunities"
          value={String(data.stats.newOpportunities)}
          icon={Sparkles}
          tone="positive"
        />
        <StatTile
          label="Deals Advanced"
          value={String(data.stats.dealsAdvanced)}
          icon={ArrowUpRight}
          tone="positive"
        />
        <StatTile
          label="Deals At Risk"
          value={String(data.stats.dealsAtRisk)}
          icon={TrendingUp}
          tone="negative"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 px-8 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="gap-0">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardTitle>Today&apos;s Intelligence</CardTitle>
              <CardAction>
                <Link href="/intelligence" className="text-xs text-accent hover:underline">
                  Open Intelligence Feed
                </Link>
              </CardAction>
            </CardHeader>
            <div>
              {data.todaysIntelligence.map((item) => (
                <IntelligenceFeedItem key={item.id} item={item} />
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <ActionRequiredCard tasks={data.actionRequired} />
          <NewOpportunitiesCard opportunities={data.newOpportunities} />
        </div>
      </div>
    </div>
  );
}
