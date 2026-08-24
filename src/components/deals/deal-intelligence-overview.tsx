import { TrendingUp, TrendingDown, Minus, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
import { acknowledgeRisk, dismissRisk, resolveRisk, ignoreInactivity } from "@/lib/actions/intelligence-actions";
import type { DealIntelligenceOverview } from "@/lib/intelligence/deal-overview";

const TREND_ICON = { IMPROVING: TrendingUp, STABLE: Minus, WEAKENING: TrendingDown, STALLED: CircleAlert } as const;
const SEVERITY_VARIANT = { LOW: "default", MEDIUM: "warning", HIGH: "negative", CRITICAL: "negative" } as const;
const INACTIVITY_VARIANT = { ACTIVE: "positive", WATCH: "warning", INACTIVE: "negative", STALE: "negative" } as const;

export function DealIntelligenceOverviewPanel({ dealId, overview }: { dealId: string; overview: DealIntelligenceOverview }) {
  const TrendIcon = TREND_ICON[overview.momentum.trend];

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Deal Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Operational Momentum</p>
            <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-foreground">
              {overview.momentum.score}
              <TrendIcon className="size-4 text-muted-foreground" />
            </p>
            <p className="text-xs text-muted-foreground">{overview.momentum.trend.charAt(0) + overview.momentum.trend.slice(1).toLowerCase()}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Deal Risk Signal</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{overview.riskScore}</p>
            <p className="text-xs text-muted-foreground">{overview.riskLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Activity</p>
            <Badge variant={INACTIVITY_VARIANT[overview.inactivity.status]} className="mt-1">
              {overview.inactivity.status}
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">{overview.inactivity.businessDaysInactive} business days</p>
          </div>
          {overview.stageDelay.isPotentialDelay && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stage Duration</p>
              <p className="mt-1 text-sm font-medium text-warning">Potential stage delay</p>
              <p className="text-xs text-muted-foreground">
                {overview.stageDelay.currentStageDays}d vs typical {overview.stageDelay.typicalStageDays}d ({overview.stageDelay.confidencePercent}% confidence)
              </p>
            </div>
          )}
        </div>

        {overview.momentum.reasons.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {overview.momentum.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}

        {overview.inactivity.status !== "ACTIVE" && !overview.inactivity.exempt && (
          <form action={ignoreInactivity.bind(null, dealId, "Client intentionally paused transaction.", undefined)}>
            <Button type="submit" size="sm" variant="outline">
              Ignore inactivity
            </Button>
          </form>
        )}
        {overview.inactivity.exempt && (
          <p className="text-xs text-muted-foreground">Inactivity ignored: {overview.inactivity.exemptReason}</p>
        )}

        {overview.openRisks.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Open Risks</p>
            <ul className="flex flex-col gap-2">
              {overview.openRisks.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Badge>
                      <span className="text-xs text-muted-foreground">{r.riskType.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-0.5 text-foreground/90">{r.description}</p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <form action={acknowledgeRisk.bind(null, r.id)}>
                      <button type="submit" className="text-muted-foreground hover:text-foreground">
                        Acknowledge
                      </button>
                    </form>
                    <form action={resolveRisk.bind(null, r.id, undefined)}>
                      <button type="submit" className="text-muted-foreground hover:text-positive">
                        Resolve
                      </button>
                    </form>
                    <form action={dismissRisk.bind(null, r.id, undefined)}>
                      <button type="submit" className="text-muted-foreground hover:text-negative">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {overview.valuationHistory.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Valuation History</p>
            <ul className="flex flex-col gap-1 text-sm">
              {overview.valuationHistory.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 tabular-nums">
                  <span className="text-muted-foreground">
                    {formatDate(v.observedAt.toISOString())} · {v.observationType.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <span className="font-medium text-foreground">{formatMoney({ amountMinorUnits: Number(v.valueMinorUnits), currency: v.currency })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {overview.recommendedActions.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended Actions</p>
            <ul className="flex flex-col gap-2">
              {overview.recommendedActions.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="font-medium text-foreground">{a.headline}</p>
                  <p className="text-xs text-muted-foreground">{a.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
