import Link from "next/link";
import { RadioTower } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/shared/badges";
import { getPendingEmailCount, getSinceLastScan } from "@/lib/pipeline/queries";
import { DEMO_ORG_ID } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export async function SinceLastScanCard() {
  const [stats, pendingCount] = await Promise.all([
    getSinceLastScan(DEMO_ORG_ID),
    getPendingEmailCount(DEMO_ORG_ID),
  ]);

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={stats.dealsChanged} label={`deal${stats.dealsChanged === 1 ? "" : "s"} changed`} />
          <Stat value={stats.actionsRequired} label="actions required" />
          <Stat value={stats.opportunities} label={`potential opportunit${stats.opportunities === 1 ? "y" : "ies"}`} />
          <Stat value={stats.risks} label={`risk${stats.risks === 1 ? "" : "s"} detected`} />
        </div>

        {stats.topEvents.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
            {stats.topEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground/90">{e.headline}</span>
                <ConfidenceBadge percent={e.confidencePercent ?? undefined} />
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">Since {formatDateTime(stats.windowStart)}</p>
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
