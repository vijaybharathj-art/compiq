import Link from "next/link";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getPrismaClient } from "@/lib/db";
import { computeMomentum, type MomentumTrend } from "@/lib/intelligence/momentum";

const TREND_VARIANT: Record<MomentumTrend, "positive" | "default" | "warning" | "negative"> = {
  IMPROVING: "positive",
  STABLE: "default",
  WEAKENING: "warning",
  STALLED: "negative",
};

const TREND_LABEL: Record<MomentumTrend, string> = {
  IMPROVING: "Improving",
  STABLE: "Stable",
  WEAKENING: "Weakening",
  STALLED: "Stalled",
};

// "Deal Momentum" on the dashboard (spec §5). Scoped to the deals that
// already appear in Top Priorities (same query result, no re-fetch of the
// deal list) rather than every active deal in the portfolio — computing
// momentum is several queries per deal, so this stays a bounded, cheap
// card instead of an O(all deals) one (spec §35-36's N+1 guidance).
export async function MomentumSummaryCard({ deals }: { deals: { id: string; projectCodename: string }[] }) {
  const db = getPrismaClient();
  const assessments = await Promise.all(
    deals.slice(0, 5).map(async (deal) => ({ deal, momentum: await computeMomentum(db, deal.id) })),
  );

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border-subtle pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-accent" />
          Deal Momentum
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {assessments.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState icon={Activity} title="No recent deal activity to assess" />
          </div>
        ) : (
          <ul>
            {assessments.map(({ deal, momentum }) => (
              <li key={deal.id} className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-0">
                <Link href={`/deals/${deal.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:text-accent">
                  {deal.projectCodename}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{momentum.score}/100</span>
                  <Badge variant={TREND_VARIANT[momentum.trend]}>{TREND_LABEL[momentum.trend]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
