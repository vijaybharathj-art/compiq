import Link from "next/link";
import { RadioTower } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { WhatChangedSummary } from "@/lib/intelligence/feed";

// The dashboard stat bar (spec §5-6) — "N deals changed / N require
// attention / $X deal value affected." Takes already-fetched stats as a
// prop rather than querying itself, so the dashboard computes
// getWhatChangedSince() exactly once and both this card and Top Priorities
// read the identical numbers (spec §38's "do not cheat," extended: the
// stat bar and the priorities list must never disagree either).
export function SinceLastScanCard({
  stats,
  pendingCount,
  windowStart,
}: {
  stats: WhatChangedSummary;
  pendingCount: number;
  windowStart: Date;
}) {
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
      <CardContent className="flex flex-col gap-3 pt-4">
        <Link href={`/intelligence?since=${sinceParam}`} className="grid grid-cols-2 gap-3 rounded-md sm:grid-cols-4 hover:bg-surface-raised/50">
          <Stat value={stats.dealsChanged} label={`deal${stats.dealsChanged === 1 ? "" : "s"} changed`} />
          <Stat value={stats.requiresAttention} label="require attention" />
          <Stat
            value={formatMoney({ amountMinorUnits: Number(stats.totalValueAffectedMinorUnits), currency: "USD" })}
            label="deal value affected"
          />
          <Stat value={stats.risks} label={`risk${stats.risks === 1 ? "" : "s"} detected`} />
        </Link>

        <p className="text-xs text-muted-foreground">Since {formatDateTime(windowStart.toISOString())}</p>
      </CardContent>
    </Card>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
