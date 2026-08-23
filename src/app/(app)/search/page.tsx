import Link from "next/link";
import { Search as SearchIcon, Briefcase, Users, CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskPill, PriorityPill } from "@/components/shared/badges";
import { dealRepository, clientRepository, taskRepository } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const query = q.toLowerCase();

  const [deals, clients, tasks] = query
    ? await Promise.all([dealRepository.list(), clientRepository.list(), taskRepository.list()])
    : [[], [], []];

  const matchedDeals = deals.filter(
    (d) =>
      d.projectCodename.toLowerCase().includes(query) ||
      d.clientName.toLowerCase().includes(query) ||
      (d.targetCompanyName?.toLowerCase().includes(query) ?? false),
  );
  const matchedClients = clients.filter((c) => c.name.toLowerCase().includes(query));
  const matchedTasks = tasks.filter((t) => t.title.toLowerCase().includes(query));

  const hasResults = matchedDeals.length + matchedClients.length + matchedTasks.length > 0;

  return (
    <div className="pb-10">
      <PageHeader
        title="Search"
        description="Find deals, clients, and tasks. Natural-language search is a planned extension."
      />

      <div className="px-8 pt-5">
        {!q && (
          <EmptyState
            icon={SearchIcon}
            title="Search deals, clients, or tasks"
            description="Use the search bar in the top navigation to get started."
          />
        )}

        {q && !hasResults && (
          <EmptyState icon={SearchIcon} title={`No results for "${q}"`} />
        )}

        {q && hasResults && (
          <div className="flex flex-col gap-4">
            {matchedDeals.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <Briefcase className="size-4 text-muted-foreground" />
                  <CardTitle>Deals ({matchedDeals.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {matchedDeals.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0">
                        <Link href={`/deals/${d.id}`} className="min-w-0">
                          <p className="text-sm font-medium text-foreground hover:text-accent">
                            {d.projectCodename}
                          </p>
                          <p className="text-xs text-muted-foreground">{d.clientName}</p>
                        </Link>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm tabular-nums text-gold">{formatMoney(d.value)}</span>
                          <RiskPill status={d.riskStatus} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {matchedClients.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <Users className="size-4 text-muted-foreground" />
                  <CardTitle>Clients ({matchedClients.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {matchedClients.map((c) => (
                      <li key={c.id} className="border-t border-border-subtle px-5 py-3 first:border-0">
                        <Link href={`/clients/${c.id}`} className="text-sm font-medium text-foreground hover:text-accent">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.sectorName}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {matchedTasks.length > 0 && (
              <Card className="gap-0">
                <CardHeader className="flex-row items-center gap-2 border-b border-border-subtle pb-3">
                  <CheckSquare className="size-4 text-muted-foreground" />
                  <CardTitle>Tasks ({matchedTasks.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <ul>
                    {matchedTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{t.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.dealCodename ?? t.clientName ?? "General"}
                          </p>
                        </div>
                        <PriorityPill priority={t.priority} />
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
