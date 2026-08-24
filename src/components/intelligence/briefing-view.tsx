import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BriefingContent, BriefingSummary } from "@/lib/intelligence/briefing-schema";

const SEVERITY_VARIANT = { LOW: "default", MEDIUM: "warning", HIGH: "negative", CRITICAL: "negative" } as const;
const URGENCY_VARIANT = { NORMAL: "default", ATTENTION: "warning", HIGH: "warning", CRITICAL: "negative" } as const;

export function BriefingView({
  title,
  greeting,
  dateLabel,
  summary,
  content,
  narrationFailed,
  generateAction,
  generateLabel,
}: {
  title: string;
  greeting: string;
  dateLabel: string;
  summary: BriefingSummary;
  content: BriefingContent;
  /** True when AIProvider.summarizeBriefing() threw (spec §72) — the
   * structured sections below are still real, computed data; only the
   * narrative paragraph is missing. Never fabricate one in its place. */
  narrationFailed?: boolean;
  generateAction: () => Promise<void>;
  generateLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4 px-8 pt-5 pb-10">
      <div className="rounded-md border border-accent/25 bg-accent/5 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{title}</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">{greeting}</p>
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
          </div>
          <form action={generateAction}>
            <Button type="submit" size="sm" variant="secondary">
              {generateLabel}
            </Button>
          </form>
        </div>
        {narrationFailed ? (
          <div className="mt-3 flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/10 px-3 py-2">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div>
              <p className="text-xs font-semibold text-warning">Briefing narrative unavailable</p>
              <p className="mt-0.5 text-xs text-foreground/80">
                Tattava was unable to generate the narrative summary. The intelligence below is unaffected — every section is real, computed data.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-foreground/90">{content.narrative}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground">
          <span>{summary.dealsChanged} deals changed</span>
          <span>{summary.dealsAdvanced} advanced</span>
          <span>{summary.risks} risk{summary.risks === 1 ? "" : "s"}</span>
          <span>{summary.opportunities} opportunit{summary.opportunities === 1 ? "y" : "ies"}</span>
          <span>{summary.tasksCreated} task{summary.tasksCreated === 1 ? "" : "s"} created</span>
        </div>
      </div>

      {content.priorities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Priorities</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.priorities.map((p, i) => (
              <div key={`${p.headline}-${i}`} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-semibold text-accent tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.headline}</p>
                  <p className="text-xs text-muted-foreground">{p.reason}</p>
                  {p.dealId && (
                    <Link href={`/deals/${p.dealId}`} className="text-xs text-accent hover:underline">
                      Open {p.dealCodename ?? "deal"} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.dealAdvancements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deal Movement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle">
            {content.dealAdvancements.map((d, i) => (
              <div key={`${d.dealId}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <Link href={`/deals/${d.dealId}`} className="font-medium text-foreground hover:text-accent">
                  {d.dealCodename}
                </Link>
                <span className="tabular-nums text-muted-foreground">
                  {d.previousStage} → <span className="font-medium text-foreground">{d.newStage}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.risks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Risks</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle">
            {content.risks.map((r, i) => (
              <div key={`${r.riskId}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  {r.dealId ? (
                    <Link href={`/deals/${r.dealId}`} className="font-medium text-foreground hover:text-accent">
                      {r.dealCodename}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{r.dealCodename ?? "Unassigned"}</span>
                  )}
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
                <Badge variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.deadlines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle">
            {content.deadlines.map((d) => (
              <div key={d.taskId} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{d.title}</p>
                  {d.dealCodename && <p className="text-xs text-muted-foreground">{d.dealCodename}</p>}
                </div>
                <Badge variant={URGENCY_VARIANT[d.urgency]}>{d.dueLabel.replace("_", " ")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.opportunities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle">
            {content.opportunities.map((o, i) => (
              <div key={`${o.clientId}-${i}`} className="py-2 text-sm first:pt-0 last:pb-0">
                <Link href={`/clients/${o.clientId}`} className="font-medium text-foreground hover:text-accent">
                  {o.clientName}
                </Link>
                <p className="text-xs text-muted-foreground">{o.signalText}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
