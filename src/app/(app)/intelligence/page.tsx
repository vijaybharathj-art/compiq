import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { IntelligenceSubNav } from "@/components/intelligence/sub-nav";
import { WhatChangedFeedItem, type WhatChangedFeedItemData } from "@/components/intelligence/what-changed-item";
import { getPrismaClient } from "@/lib/db";
import { getIntelligenceFeed, getWhatChangedSince, type FeedFilter, type FeedSort } from "@/lib/intelligence/feed";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { Radar, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntelligenceCategory } from "@/types/domain";

const FILTERS: { value: FeedFilter | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "MY_DEALS", label: "My Deals" },
  { value: "HIGH_PRIORITY", label: "Action Required" },
  { value: "STAGE", label: "Stage Changes" },
  { value: "VALUATION", label: "Valuation" },
  { value: "RISKS", label: "Risks" },
  { value: "INACTIVITY", label: "Inactivity" },
  { value: "DEADLINES", label: "Deadlines" },
  { value: "TASKS", label: "Tasks" },
  { value: "OPPORTUNITIES", label: "Opportunities" },
  { value: "CLIENT_ACTIVITY", label: "Client Activity" },
];

const SORTS: { value: FeedSort; label: string }[] = [
  { value: "IMPORTANCE", label: "Highest Importance" },
  { value: "NEWEST", label: "Newest" },
];

type GroupMode = "NONE" | "DEAL" | "CATEGORY";
const GROUPS: { value: GroupMode; label: string }[] = [
  { value: "NONE", label: "No grouping" },
  { value: "DEAL", label: "By Deal" },
  { value: "CATEGORY", label: "By Category" },
];

const CATEGORY_HEADING: Record<IntelligenceCategory, string> = {
  DEAL_CHANGE: "Deal Change",
  CLIENT_ACTIVITY: "Client Activity",
  TASK: "Task",
  OPPORTUNITY: "Opportunity",
  RISK: "Risk",
  IMPORTANT_EMAIL: "Important Email",
};

function groupItems(items: WhatChangedFeedItemData[], mode: GroupMode): { heading: string; items: WhatChangedFeedItemData[] }[] {
  if (mode === "NONE") return [{ heading: "", items }];
  const buckets = new Map<string, WhatChangedFeedItemData[]>();
  for (const item of items) {
    const key = mode === "DEAL" ? (item.deal?.projectCodename ?? "No deal") : CATEGORY_HEADING[item.category];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return Array.from(buckets.entries()).map(([heading, items]) => ({ heading, items }));
}

// "What Changed?" — the Phase 4 primary intelligence experience (spec §3-6).
// Server-rendered and searchParams-driven (not client-filtered) since every
// filter maps directly to a distinct, priority-ranked database query via
// getIntelligenceFeed — the whole point is these numbers are never
// hardcoded (spec §38).
export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; since?: string; sort?: string; group?: string }>;
}) {
  const sp = await searchParams;
  const [session, db] = [await auth(), getPrismaClient()];
  const filter = FILTERS.some((f) => f.value === sp.filter) ? (sp.filter as FeedFilter | "ALL") : "ALL";
  const since = sp.since ? new Date(sp.since) : new Date(DEMO_NOW.getTime() - 24 * 60 * 60 * 1000);
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as FeedSort) : "IMPORTANCE";
  const group = GROUPS.some((g) => g.value === sp.group) ? (sp.group as GroupMode) : "NONE";

  const [items, whatChanged] = await Promise.all([
    getIntelligenceFeed(db, DEMO_ORG_ID, {
      filter: filter === "ALL" ? undefined : filter,
      search: sp.q,
      userId: session?.user?.id,
      since: sp.since ? since : undefined,
      sort,
    }),
    getWhatChangedSince(db, DEMO_ORG_ID, since),
  ]);

  // Preserves every other control (search, sort, group, since) while
  // changing one — so "Sort: Newest" and "Filter: Risks" compose instead
  // of resetting each other, per spec §14's "preserve filters in URL".
  const buildHref = (overrides: { filter?: string; sort?: string; group?: string }) => {
    const params = new URLSearchParams();
    const nextFilter = overrides.filter ?? filter;
    const nextSort = overrides.sort ?? sort;
    const nextGroup = overrides.group ?? group;
    if (nextFilter !== "ALL") params.set("filter", nextFilter);
    if (nextSort !== "IMPORTANCE") params.set("sort", nextSort);
    if (nextGroup !== "NONE") params.set("group", nextGroup);
    if (sp.q) params.set("q", sp.q);
    if (sp.since) params.set("since", sp.since);
    const qs = params.toString();
    return qs ? `/intelligence?${qs}` : "/intelligence";
  };

  const groups = groupItems(items, group);

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
          {/* Each metric filters the feed on click (spec §16) — same query
              window, so what's clicked always matches what's shown. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <Link href={buildHref({ filter: "HIGH_PRIORITY" })} className="hover:text-accent hover:underline underline-offset-2">
              {whatChanged.requiresAttention} require attention
            </Link>
            <span>·</span>
            <Link href={buildHref({ filter: "STAGE" })} className="hover:text-accent hover:underline underline-offset-2">
              {whatChanged.dealsAdvanced} advanced
            </Link>
            <span>·</span>
            <Link href={buildHref({ filter: "OPPORTUNITIES" })} className="hover:text-accent hover:underline underline-offset-2">
              {whatChanged.newOpportunities} new opportunit{whatChanged.newOpportunities === 1 ? "y" : "ies"}
            </Link>
            <span>·</span>
            <Link href={buildHref({ filter: "RISKS" })} className="hover:text-accent hover:underline underline-offset-2">
              {whatChanged.risks} risk{whatChanged.risks === 1 ? "" : "s"} detected
            </Link>
            {whatChanged.totalValueAffectedMinorUnits > 0n && (
              <>
                <span>·</span>
                <span>{formatMoney({ amountMinorUnits: Number(whatChanged.totalValueAffectedMinorUnits), currency: "USD" })} of deal value affected</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-8 pt-4">
        <form className="relative w-64" action="/intelligence">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder="Search deal, client, event…" className="h-8 pl-8 text-sm" />
          {filter !== "ALL" && <input type="hidden" name="filter" value={filter} />}
          {sort !== "IMPORTANCE" && <input type="hidden" name="sort" value={sort} />}
          {group !== "NONE" && <input type="hidden" name="group" value={group} />}
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={buildHref({ filter: f.value })}
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

      <div className="flex flex-wrap items-center gap-4 px-8 pt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={buildHref({ sort: s.value })}
              className={cn("rounded-sm px-1.5 py-0.5", sort === s.value ? "font-medium text-accent" : "text-muted-foreground hover:text-foreground")}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Group</span>
          {GROUPS.map((g) => (
            <Link
              key={g.value}
              href={buildHref({ group: g.value })}
              className={cn("rounded-sm px-1.5 py-0.5", group === g.value ? "font-medium text-accent" : "text-muted-foreground hover:text-foreground")}
            >
              {g.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="px-8 pt-4">
        {items.length === 0 ? (
          <Card className="gap-0">
            <div className="px-5 py-6">
              <EmptyState icon={Radar} title="Nothing here yet" description="Run a scan to generate intelligence, or adjust your filters." />
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.heading || "all"}>
                {g.heading && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.heading}</p>}
                <Card className="gap-0">
                  {g.items.map((item) => (
                    <WhatChangedFeedItem key={item.id} item={item} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
