import Link from "next/link";
import { RadioTower } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/shared/badges";
import { getPendingEmailCount } from "@/lib/pipeline/queries";
import { getWhatChangedSince } from "@/lib/intelligence/feed";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

// "What Changed?" on the dashboard (spec §4/§37/§38) — same
// getWhatChangedSince query the /intelligence page uses, windowed by the
// last completed scan, so the number here and the filtered feed it links
// to always agree.
export async function SinceLastScanCard() {
  const db = getPrismaClient();
  const lastJob = await db.emailProcessingJob.findFirst({
    where: { organizationId: DEMO_ORG_ID, status: "COMPLETED" },
    orderBy: { finishedAt: "desc" },
  });
  const windowStart = lastJob?.finishedAt ?? new Date(DEMO_NOW.getTime() - 1000 * 60 * 60 * 24);

  const [stats, pendingCount] = await Promise.all([
    getWhatChangedSince(db, DEMO_ORG_ID, windowStart),
    getPendingEmailCount(DEMO_ORG_ID),
  ]);

  const sinceParam = encodeURIComponent(windowStart.toISOString());

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border-subtle pb-3">
        <CardTitle className="flex items-center gap-2">
          <RadioTower className="size-4 text-accent" />
          Since Your Last Scan
        </CardTitle>
        <CardAction>
          <Link href="/intelligence/scan" className="text-xs text-accent hover:underline">
            {pendingCount > 0 ? `Run Scan (${pendingCount} waiting)` : "Open Scan"}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <Link href={`/intelligence?since=${sinceParam}`} className="grid grid-cols-2 gap-3 rounded-md sm:grid-cols-4 hover:bg-surface-raised/50">
          <Stat value={stats.dealsChanged} label={`deal${stats.dealsChanged === 1 ? "" : "s"} changed`} />
          <Stat value={stats.requiresAttention} label="require attention" />
          <Stat value={stats.newOpportunities} label={`potential opportunit${stats.newOpportunities === 1 ? "y" : "ies"}`} />
          <Stat value={stats.risks} label={`risk${stats.risks === 1 ? "" : "s"} detected`} />
        </Link>

        {stats.topEvents.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
            {stats.topEvents.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground/90">{e.headline}</span>
                <ConfidenceBadge percent={e.confidencePercent ?? undefined} />
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">Since {formatDateTime(windowStart.toISOString())}</p>
      </CardContent>
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
