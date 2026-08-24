import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { TrustBadge } from "@/components/shared/badges";
import { WhyAmISeeingThis } from "@/components/shared/why-am-i-seeing-this";
import { WhyThisMatters } from "@/components/shared/why-this-matters";
import { formatMoney } from "@/lib/format";
import { importanceTier } from "@/lib/intelligence/importance";
import { recommendedActionText } from "@/lib/intelligence/recommendations";
import type { WhatChangedSummary } from "@/lib/intelligence/feed";
import type { IntelligenceEventType } from "@/lib/pipeline/intelligence-events";

// "Top Priorities" (PHASE4_5_PRODUCTION_HARDENING.md — spec §6) — the 3-5
// highest-importance events the dashboard's own "since last scan" query
// already ranked (never a second query, never a re-sort with different
// logic), each rendered with the same trust-layer evidence every other
// intelligence surface uses.

export function TopPrioritiesCard({ events }: { events: WhatChangedSummary["topEvents"] }) {
  const top = events.slice(0, 5);

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border-subtle pb-3">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-accent" />
          Top Priorities
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {top.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No material changes"
            description="Tattava hasn't detected any material deal changes since your last briefing."
          />
        ) : (
          <ol className="flex flex-col divide-y divide-border-subtle">
            {top.map((event, index) => {
              const tier = importanceTier(event.importanceScore ?? 0);
              const dealValue = event.deal ? (event.deal.enterpriseValueMinorUnits ?? event.deal.valueMinorUnits) : null;
              const recommended = event.deal && event.eventType
                ? recommendedActionText(event.eventType as IntelligenceEventType, event.headline, event.deal.projectCodename)
                : null;
              const href = event.dealId ? `/deals/${event.dealId}` : event.clientId ? `/clients/${event.clientId}` : undefined;

              return (
                <li key={event.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {event.deal && (
                        <span className="text-sm font-semibold text-foreground">{event.deal.projectCodename}</span>
                      )}
                      {dealValue ? (
                        <span className="text-xs text-muted-foreground">
                          {formatMoney({ amountMinorUnits: Number(dealValue), currency: event.deal!.currency })}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{tier}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{event.headline}</p>
                    {event.detail && <WhyThisMatters text={event.detail} />}
                    {recommended && (
                      <p className="mt-1.5 text-xs text-foreground/90">
                        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Recommended: </span>
                        {recommended}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <TrustBadge confidencePercent={event.confidencePercent} />
                      {event.sourceEmail && (
                        <WhyAmISeeingThis
                          source={event.sourceEmail.fromName ?? event.sourceEmail.fromAddress}
                          occurredAt={event.sourceEmail.receivedAt}
                          dealCodename={event.deal?.projectCodename}
                          evidenceQuote={event.sourceEmail.bodyText}
                          confidencePercent={event.confidencePercent}
                        />
                      )}
                      {href && (
                        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline underline-offset-2">
                          View {event.dealId ? "deal" : "client"}
                          <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
