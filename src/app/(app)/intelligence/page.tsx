import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { IntelligenceSubNav } from "@/components/intelligence/sub-nav";
import { WhatChangedFeedItem } from "@/components/intelligence/what-changed-item";
import { getPrismaClient } from "@/lib/db";
import { getIntelligenceFeed, getWhatChangedSince, type FeedFilter } from "@/lib/intelligence/feed";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { Radar, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS: { value: FeedFilter | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "MY_DEALS", label: "My Deals" },
  { value: "HIGH_PRIORITY", label: "High Priority" },
  { value: "STAGE", label: "Stage Changes" },
  { value: "VALUATION", label: "Valuation" },
  { value: "RISKS", label: "Risks" },
  { value: "INACTIVITY", label: "Inactivity" },
  { value: "DEADLINES", label: "Deadlines" },
  { value: "TASKS", label: "Tasks" },
  { value: "OPPORTUNITIES", label: "Opportunities" },
  { value: "CLIENT_ACTIVITY", label: "Client Activity" },
];

// "What Changed?" — the Phase 4 primary intelligence experience (spec §3-6).
// Server-rendered and searchParams-driven (not client-filtered) since every
// filter maps directly to a distinct, priority-ranked database query via
// getIntelligenceFeed — the whole point is these numbers are never
// hardcoded (spec §38).
export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; since?: string }>;
}) {
  const sp = await searchParams;
  const [session, db] = [await auth(), getPrismaClient()];
  const filter = FILTERS.some((f) => f.value === sp.filter) ? (sp.filter as FeedFilter | "ALL") : "ALL";
  const since = sp.since ? new Date(sp.since) : new Date(DEMO_NOW.getTime() - 24 * 60 * 60 * 1000);

  const [items, whatChanged] = await Promise.all([
    getIntelligenceFeed(db, DEMO_ORG_ID, {
      filter: filter === "ALL" ? undefined : filter,
      search: sp.q,
      userId: session?.user?.id,
      since: sp.since ? since : undefined,
    }),
    getWhatChangedSince(db, DEMO_ORG_ID, since),
  ]);

  return (
    <div className="pb-10">
      <PageHeader
        title="What Changed?"
        description="Every meaningful event Tattava detected, ranked by importance — not every email, only what matters."
      />
      <IntelligenceSubNav />

      <div className="px-8 pt-5">
        <div className="rounded-md border border-accent/25 bg-accent/5 px-5 py-4">
          <p className="text-sm font-semibold text-foreground">
            {whatChanged.dealsChanged} deal{whatChanged.dealsChanged === 1 ? "" : "s"} changed since{" "}
            {since.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {whatChanged.requiresAttention} require your attention · {whatChanged.dealsAdvanced} advanced ·{" "}
            {whatChanged.newOpportunities} new opportunit{whatChanged.newOpportunities === 1 ? "y" : "ies"} ·{" "}
            {whatChanged.risks} risk{whatChanged.risks === 1 ? "" : "s"} detected
            {whatChanged.totalValueAffectedMinorUnits > 0n && (
              <> · {formatMoney({ amountMinorUnits: Number(whatChanged.totalValueAffectedMinorUnits), currency: "USD" })} of deal value affected</>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-8 pt-4">
        <form className="relative w-64" action="/intelligence">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder="Search deal, client, event…" className="h-8 pl-8 text-sm" />
          {filter !== "ALL" && <input type="hidden" name="filter" value={filter} />}
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "ALL" ? "/intelligence" : `/intelligence?filter=${f.value}`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                filter === f.value
                  ? "border-accent/40 bg-accent/12 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="px-8 pt-4">
        <Card className="gap-0">
          {items.length === 0 ? (
            <div className="px-5 py-6">
              <EmptyState icon={Radar} title="Nothing here yet" description="Run a scan to generate intelligence, or adjust your filters." />
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <WhatChangedFeedItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
