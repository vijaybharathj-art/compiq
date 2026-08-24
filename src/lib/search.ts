import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { parseSearchQuery } from "@/lib/search-query";
import type { ParsedSearchQuery } from "@/lib/search-query";

export { parseSearchQuery } from "@/lib/search-query";
export type { ParsedSearchQuery } from "@/lib/search-query";

const db = getPrismaClient();

export interface SearchResultDeal {
  id: string;
  projectCodename: string;
  clientName: string;
  stageLabel: string;
  valueMinorUnits: number | null;
  currency: string;
  riskStatus: string;
}

export interface SearchResultClient {
  id: string;
  name: string;
  sectorName: string;
}

export interface SearchResultCompany {
  id: string;
  name: string;
}

export interface SearchResultTask {
  id: string;
  title: string;
  dealId: string | null;
  clientId: string | null;
  priority: string;
}

export interface SearchResultEmail {
  id: string;
  subject: string;
  fromName: string | null;
  receivedAt: string;
  dealId: string | null;
}

export interface SearchResults {
  parsed: ParsedSearchQuery;
  deals: SearchResultDeal[];
  clients: SearchResultClient[];
  companies: SearchResultCompany[];
  tasks: SearchResultTask[];
  emails: SearchResultEmail[];
}

const EMPTY_RESULTS: Omit<SearchResults, "parsed"> = {
  deals: [],
  clients: [],
  companies: [],
  tasks: [],
  emails: [],
};

export async function runSearch(rawQuery: string): Promise<SearchResults> {
  const parsed = parseSearchQuery(rawQuery);
  const hasStructuredFilter = Boolean(
    parsed.riskStatus || parsed.stageKeys || parsed.valueMinMinorUnits,
  );

  if (!parsed.freeText && !hasStructuredFilter) {
    return { parsed, ...EMPTY_RESULTS };
  }

  const dealWhere: Record<string, unknown> = { organizationId: DEMO_ORG_ID };
  if (parsed.riskStatus) dealWhere.riskStatus = parsed.riskStatus;
  if (parsed.stageKeys) dealWhere.currentStage = { key: { in: parsed.stageKeys } };
  if (parsed.valueMinMinorUnits && parsed.valueMaxMinorUnits) {
    dealWhere.valueMinorUnits = { gte: parsed.valueMinMinorUnits, lte: parsed.valueMaxMinorUnits };
  }
  if (parsed.freeText) {
    dealWhere.OR = [
      { projectCodename: { contains: parsed.freeText, mode: "insensitive" } },
      { client: { name: { contains: parsed.freeText, mode: "insensitive" } } },
      { targetCompany: { name: { contains: parsed.freeText, mode: "insensitive" } } },
    ];
  }

  const dealsPromise = db.deal.findMany({
    where: dealWhere,
    include: { client: true, currentStage: true },
    orderBy: { lastActivityAt: "desc" },
    take: 25,
  });

  // Structured-only filters (risk/stage/value) don't make sense against
  // clients/companies/tasks/emails, which have no such fields — only run
  // those lookups when there's actual free text to match.
  const clientsPromise = parsed.freeText
    ? db.client.findMany({
        where: { organizationId: DEMO_ORG_ID, name: { contains: parsed.freeText, mode: "insensitive" } },
        include: { sector: true },
        take: 15,
      })
    : Promise.resolve([]);

  const companiesPromise = parsed.freeText
    ? db.company.findMany({
        where: { organizationId: DEMO_ORG_ID, name: { contains: parsed.freeText, mode: "insensitive" } },
        take: 15,
      })
    : Promise.resolve([]);

  const tasksPromise = parsed.freeText
    ? db.task.findMany({
        where: { organizationId: DEMO_ORG_ID, title: { contains: parsed.freeText, mode: "insensitive" } },
        take: 15,
      })
    : Promise.resolve([]);

  const emailsPromise = parsed.freeText
    ? db.email.findMany({
        where: {
          OR: [
            { subject: { contains: parsed.freeText, mode: "insensitive" } },
            { bodyText: { contains: parsed.freeText, mode: "insensitive" } },
          ],
        },
        include: { thread: true },
        orderBy: { receivedAt: "desc" },
        take: 15,
      })
    : Promise.resolve([]);

  const [deals, clients, companies, tasks, emails] = await Promise.all([
    dealsPromise,
    clientsPromise,
    companiesPromise,
    tasksPromise,
    emailsPromise,
  ]);

  return {
    parsed,
    deals: deals.map((d) => ({
      id: d.id,
      projectCodename: d.projectCodename,
      clientName: d.client.name,
      stageLabel: d.currentStage.label,
      valueMinorUnits: d.valueMinorUnits === null ? null : Number(d.valueMinorUnits),
      currency: d.currency,
      riskStatus: d.riskStatus,
    })),
    clients: clients.map((c) => ({ id: c.id, name: c.name, sectorName: c.sector?.name ?? "—" })),
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dealId: t.dealId,
      clientId: t.clientId,
      priority: t.priority,
    })),
    emails: emails.map((e) => ({
      id: e.id,
      subject: e.subject,
      fromName: e.fromName,
      receivedAt: e.receivedAt.toISOString(),
      dealId: e.thread.dealId,
    })),
  };
}
