import { TrendingUp, TrendingDown, Minus, CircleAlert, HelpCircle, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrustBadge } from "@/components/shared/badges";
import { WhyThisMatters } from "@/components/shared/why-this-matters";
import { formatMoney, formatDate } from "@/lib/format";
import { formatPercentChange } from "@/lib/intelligence/valuation";
import { acknowledgeRisk, dismissRisk, resolveRisk, ignoreInactivity } from "@/lib/actions/intelligence-actions";
import type { DealIntelligenceOverview } from "@/lib/intelligence/deal-overview";
import { cn } from "@/lib/utils";

const TREND_ICON = { IMPROVING: TrendingUp, STABLE: Minus, WEAKENING: TrendingDown, STALLED: CircleAlert } as const;
const SEVERITY_VARIANT = { LOW: "default", MEDIUM: "warning", HIGH: "negative", CRITICAL: "negative" } as const;
const INACTIVITY_VARIANT = { ACTIVE: "positive", WATCH: "warning", INACTIVE: "negative", STALE: "negative" } as const;

function WhyPopover({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-left">{trigger}</button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <HelpCircle className="size-3.5" />
          Why?
        </p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function DealIntelligenceOverviewPanel({ dealId, overview }: { dealId: string; overview: DealIntelligenceOverview }) {
  const TrendIcon = TREND_ICON[overview.momentum.trend];
  const positiveReasons = overview.momentum.trend === "IMPROVING" ? overview.momentum.reasons : [];
  const negativeReasons = overview.momentum.trend === "WEAKENING" || overview.momentum.trend === "STALLED" ? overview.momentum.reasons : [];

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Deal Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <WhyPopover
            trigger={
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Operational Momentum</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-foreground">
                  {overview.momentum.score}
                  <TrendIcon className="size-4 text-muted-foreground" />
                </p>
                <p className="text-xs text-muted-foreground">{overview.momentum.trend.charAt(0) + overview.momentum.trend.slice(1).toLowerCase()}</p>
              </>
            }
          >
            <div className="flex flex-col gap-2 text-sm">
              {positiveReasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-positive">Positive</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                    {positiveReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {negativeReasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-negative">Negative</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                    {negativeReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {positiveReasons.length === 0 && negativeReasons.length === 0 && (
                <p className="text-xs text-muted-foreground">No notable positive or negative drivers this period — momentum is stable.</p>
              )}
            </div>
          </WhyPopover>

          <WhyPopover
            trigger={
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Deal Risk Signal</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{overview.riskScore}</p>
                <p className="text-xs text-muted-foreground">{overview.riskLabel}</p>
              </>
            }
          >
            <div className="flex flex-col gap-1.5 text-sm">
              {overview.openRisks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open risk signals.</p>
              ) : (
                (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
                  .filter((sev) => overview.riskSeverityCounts[sev] > 0)
                  .map((sev) => (
                    <div key={sev} className="flex items-center justify-between text-xs">
                      <Badge variant={SEVERITY_VARIANT[sev]}>{sev}</Badge>
                      <span className="text-foreground/90">
                        {overview.riskSeverityCounts[sev]} signal{overview.riskSeverityCounts[sev] === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))
              )}
              <p className="mt-1 border-t border-border-subtle pt-1.5 text-xs">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">Overall: </span>
                {overview.riskLabel}
              </p>
            </div>
          </WhyPopover>

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

        {overview.stageVelocity.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Stage Timeline</p>
            <ol className="flex flex-col gap-1">
              {overview.stageVelocity.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn("flex items-center gap-1.5", s.isCurrent ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {s.isCurrent && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    {s.stageLabel}
                    {s.isCurrent && <span className="text-[10px] font-medium uppercase tracking-wide text-accent">Current</span>}
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground">{s.days}d</span>
                </li>
              ))}
            </ol>
          </div>
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
                      <TrustBadge confidencePercent={r.confidencePercent} />
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
            <ol className="flex flex-col">
              {overview.valuationHistory.map(({ observation, change }, i) => (
                <li key={observation.id}>
                  {i > 0 && change && (
                    <div className="flex items-center gap-2 py-0.5 pl-1 text-[11px] text-muted-foreground">
                      <ArrowDown className="size-3" />
                      {change.percentChange !== null && (
                        <span className={change.direction === "UP" ? "text-positive" : change.direction === "DOWN" ? "text-negative" : ""}>
                          {formatPercentChange(change.percentChange)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
                    <span className="text-muted-foreground">
                      {formatDate(observation.observedAt.toISOString())} · {observation.observationType.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {formatMoney({ amountMinorUnits: Number(observation.valueMinorUnits), currency: observation.currency })}
                      </span>
                      <TrustBadge confidencePercent={observation.confidencePercent} />
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {overview.recommendedActions.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended Actions</p>
            <ul className="flex flex-col gap-2">
              {overview.recommendedActions.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="font-medium text-foreground">{a.headline}</p>
                  {a.reason && <WhyThisMatters text={a.reason} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
