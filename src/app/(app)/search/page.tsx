import Link from "next/link";
import { Search as SearchIcon, Briefcase, Users, CheckSquare, Building2, Mail } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskPill, PriorityPill } from "@/components/shared/badges";
import { runSearch } from "@/lib/search";
import { formatMoney, formatDate } from "@/lib/format";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const results = q ? await runSearch(q) : null;
  const hasResults =
    results &&
    results.deals.length +
      results.clients.length +
      results.companies.length +
      results.tasks.length +
      results.emails.length >
      0;

  const activeFilters = results
    ? [
        results.parsed.riskStatus && `risk: ${results.parsed.riskStatus.replace("_", " ").toLowerCase()}`,
        results.parsed.stageKeys && `stage match`,
        results.parsed.valueMinMinorUnits && `value range detected`,
      ].filter(Boolean)
    : [];

  return (
    <div className="pb-10">
      <PageHeader
        title="Search"
        description={
          'Find deals, clients, companies, tasks, and emails. Recognizes value ranges ("$500M"), risk ("high risk"), and stage names ("due diligence").'
        }
      />

      <div className="px-8 pt-5">
        {!q && (
          <EmptyState
            icon={SearchIcon}
            title="Search deals, clients, companies, tasks, or emails"
            description="Use the search bar in the top navigation to get started."
          />
        )}

        {q && !hasResults && <EmptyState icon={SearchIcon} title={`No results for "${q}"`} />}

        {q && results && hasResults && (
          <div className="flex flex-col gap-4">
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Detected:</span>
                {activeFilters.map((f) => (
                  <Badge key={f} variant="accent">
                    {f}
                  </Badge>
                ))}
              </div>
            )}

            {results.deals.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <Briefcase className="size-4 text-muted-foreground" />
                  <CardTitle>Deals ({results.deals.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {results.deals.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
                      >
                        <Link href={`/deals/${d.id}`} className="min-w-0">
                          <p className="text-sm font-medium text-foreground hover:text-accent">
                            {d.projectCodename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {d.clientName} · {d.stageLabel}
                          </p>
                        </Link>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm tabular-nums text-gold">
                            {formatMoney(
                              d.valueMinorUnits === null
                                ? undefined
                                : { amountMinorUnits: d.valueMinorUnits, currency: d.currency },
                            )}
                          </span>
                          <RiskPill status={d.riskStatus as "ON_TRACK" | "WATCH" | "AT_RISK"} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {results.clients.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <Users className="size-4 text-muted-foreground" />
                  <CardTitle>Clients ({results.clients.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {results.clients.map((c) => (
                      <li key={c.id} className="border-t border-border-subtle px-5 py-3 first:border-0">
                        <Link
                          href={`/clients/${c.id}`}
                          className="text-sm font-medium text-foreground hover:text-accent"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.sectorName}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {results.companies.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <Building2 className="size-4 text-muted-foreground" />
                  <CardTitle>Companies ({results.companies.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {results.companies.map((c) => (
                      <li
                        key={c.id}
                        className="border-t border-border-subtle px-5 py-3 text-sm text-foreground first:border-0"
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {results.tasks.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <CheckSquare className="size-4 text-muted-foreground" />
                  <CardTitle>Tasks ({results.tasks.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {results.tasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
                      >
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <PriorityPill priority={t.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {results.emails.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <CardTitle>Emails ({results.emails.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {results.emails.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
                      >
                        <Link
                          href={e.dealId ? `/deals/${e.dealId}` : "#"}
                          className="min-w-0"
                        >
                          <p className="truncate text-sm font-medium text-foreground hover:text-accent">
                            {e.subject}
                          </p>
                          <p className="text-xs text-muted-foreground">{e.fromName}</p>
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatDate(e.receivedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
