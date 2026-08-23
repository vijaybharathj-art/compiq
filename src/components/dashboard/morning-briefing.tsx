"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { DashboardData } from "@/lib/data";

export function MorningBriefing({ data, firstName }: { data: DashboardData; firstName: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const topChanges = data.todaysIntelligence
    .filter((i) => i.category === "DEAL_CHANGE" || i.category === "CLIENT_ACTIVITY")
    .slice(0, 3);
  const topActions = data.actionRequired.slice(0, 3);

  return (
    <div className="mx-8 mt-6 rounded-md border border-accent/25 bg-accent/5">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Tattava Morning Brief</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Good morning, {firstName}.</p>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Portfolio
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                  <li>{data.stats.activeDeals} active deals</li>
                  <li>{formatMoney({ amountMinorUnits: data.stats.totalDealValueMinorUnits, currency: "USD" })} tracked value</li>
                  <li>{data.stats.dealsRequiringAttention} deals require attention</li>
                  <li>{data.stats.newOpportunities} new opportunities</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Most important changes
                </p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm text-foreground">
                  {topChanges.map((c) => (
                    <li key={c.id}>{c.headline}.</li>
                  ))}
                </ol>
              </div>
            </div>

            {topActions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Actions
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-foreground">
                  {topActions.map((t) => (
                    <li key={t.id}>{t.title}.</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss morning brief"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
