import { bankers, getBanker } from "./fixtures/bankers";
import { clients, getClient } from "./fixtures/clients";
import { deals, getDeal } from "./fixtures/deals";
import { getDealEvents } from "./fixtures/deal-events";
import { getSector, sectors } from "./fixtures/sectors";
import { getTasksForDeal, tasks } from "./fixtures/tasks";
import { getOpportunitiesForClient, opportunities } from "./fixtures/opportunities";
import { getIntelligenceForDeal, intelligenceItems } from "./fixtures/intelligence";
import { auditLogEntries } from "./fixtures/audit-log";
import type {
  AuditLogRepository,
  ClientDetail,
  ClientListItem,
  ClientRepository,
  DashboardData,
  DashboardRepository,
  DealDetail,
  DealFilters,
  DealListItem,
  DealRepository,
  IntelligenceRepository,
  ReferenceRepository,
  TaskListItem,
  TaskRepository,
} from "./types";
import type { Deal, RiskStatus } from "@/types/domain";

function stageLabel(deal: Deal, key?: string) {
  if (!key) return undefined;
  return deal.workflowStages.find((s) => s.key === key)?.label ?? key;
}

function enrichDeal(deal: Deal): DealListItem {
  const client = getClient(deal.clientId)!;
  const banker = getBanker(deal.leadBankerId)!;
  const sector = getSector(deal.sectorId);
  return {
    ...deal,
    clientName: client.name,
    currentStageLabel: stageLabel(deal, deal.currentStageKey) ?? deal.currentStageKey,
    previousStageLabel: stageLabel(deal, deal.previousStageKey),
    leadBankerName: banker.name,
    sectorName: sector?.name ?? "—",
  };
}

function enrichTask(task: (typeof tasks)[number]): TaskListItem {
  const deal = task.dealId ? getDeal(task.dealId) : undefined;
  const client = task.clientId ? getClient(task.clientId) : undefined;
  const owner = getBanker(task.ownerId);
  return {
    ...task,
    dealCodename: deal?.projectCodename,
    clientName: client?.name,
    ownerName: owner?.name ?? "Unassigned",
  };
}

export const demoDealRepository: DealRepository = {
  async list(filters?: DealFilters) {
    let result = deals.map(enrichDeal);
    if (filters?.bankingService) {
      result = result.filter((d) => d.bankingServiceId === filters.bankingService);
    }
    if (filters?.dealType) {
      result = result.filter((d) => d.dealType === filters.dealType);
    }
    if (filters?.sectorId) {
      result = result.filter((d) => d.sectorId === filters.sectorId);
    }
    if (filters?.priority) {
      result = result.filter((d) => d.priority === filters.priority);
    }
    if (filters?.riskStatus) {
      result = result.filter((d) => d.riskStatus === filters.riskStatus);
    }
    if (filters?.clientId) {
      result = result.filter((d) => d.clientId === filters.clientId);
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase();
      result = result.filter(
        (d) =>
          d.projectCodename.toLowerCase().includes(q) ||
          d.clientName.toLowerCase().includes(q) ||
          (d.targetCompanyName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
  },

  async get(id: string): Promise<DealDetail | null> {
    const deal = getDeal(id);
    if (!deal) return null;
    const enriched = enrichDeal(deal);
    const client = getClient(deal.clientId)!;
    const leadBanker = getBanker(deal.leadBankerId)!;
    const teamMembers = deal.team.map((t) => ({
      banker: getBanker(t.bankerId)!,
      role: t.role,
    }));
    return {
      ...enriched,
      client,
      leadBanker,
      teamMembers,
      timeline: getDealEvents(id),
      tasks: getTasksForDeal(id),
      emails: [],
      intelligence: getIntelligenceForDeal(id),
    };
  },
};

export const demoClientRepository: ClientRepository = {
  async list(): Promise<ClientListItem[]> {
    return clients.map((client) => {
      const clientDeals = deals.filter((d) => d.clientId === client.id);
      const sector = getSector(client.sectorId);
      const banker = getBanker(client.primaryBankerId);
      return {
        ...client,
        sectorName: sector?.name ?? "—",
        activeDealCount: clientDeals.length,
        totalDealValueMinorUnits: clientDeals.reduce(
          (sum, d) => sum + (d.value?.amountMinorUnits ?? 0),
          0,
        ),
        primaryBankerName: banker?.name ?? "Unassigned",
      };
    });
  },

  async get(id: string): Promise<ClientDetail | null> {
    const client = getClient(id);
    if (!client) return null;
    const clientDeals = deals.filter((d) => d.clientId === id).map(enrichDeal);
    const sector = getSector(client.sectorId);
    const banker = getBanker(client.primaryBankerId);
    return {
      ...client,
      sectorName: sector?.name ?? "—",
      activeDealCount: clientDeals.length,
      totalDealValueMinorUnits: clientDeals.reduce(
        (sum, d) => sum + (d.value?.amountMinorUnits ?? 0),
        0,
      ),
      primaryBankerName: banker?.name ?? "Unassigned",
      deals: clientDeals,
      opportunities: getOpportunitiesForClient(id),
      recentIntelligence: intelligenceItems
        .filter((i) => i.clientId === id)
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
      contacts: client.contacts,
    };
  },
};

export const demoTaskRepository: TaskRepository = {
  async list(filters) {
    let result = tasks.map(enrichTask);
    if (filters?.status) result = result.filter((t) => t.status === filters.status);
    if (filters?.dealId) result = result.filter((t) => t.dealId === filters.dealId);
    if (filters?.clientId) result = result.filter((t) => t.clientId === filters.clientId);
    return result.sort((a, b) => {
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    });
  },
};

export const demoIntelligenceRepository: IntelligenceRepository = {
  async list(category) {
    const enriched = intelligenceItems.map((item) => ({
      ...item,
      dealCodename: item.dealId ? getDeal(item.dealId)?.projectCodename : undefined,
      clientName: item.clientId ? getClient(item.clientId)?.name : undefined,
    }));
    const filtered = category ? enriched.filter((i) => i.category === category) : enriched;
    return filtered.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  },
};

export const demoAuditLogRepository: AuditLogRepository = {
  async list() {
    return [...auditLogEntries].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  },
};

export const demoReferenceRepository: ReferenceRepository = {
  async sectors() {
    return sectors;
  },
  async bankers() {
    return bankers;
  },
};

const RISK_WEIGHT: Record<RiskStatus, number> = { AT_RISK: 2, WATCH: 1, ON_TRACK: 0 };

export const demoDashboardRepository: DashboardRepository = {
  async get(): Promise<DashboardData> {
    const enrichedDeals = deals.map(enrichDeal);
    const activeDeals = enrichedDeals.length;
    const totalDealValueMinorUnits = enrichedDeals.reduce(
      (sum, d) => sum + (d.value?.amountMinorUnits ?? 0),
      0,
    );
    const dealsAtRisk = enrichedDeals.filter((d) => d.riskStatus === "AT_RISK").length;
    const dealsRequiringAttention = enrichedDeals.filter(
      (d) => RISK_WEIGHT[d.riskStatus] > 0 || d.priority === "CRITICAL",
    ).length;
    const dealsAdvanced = enrichedDeals.filter((d) => !!d.previousStageKey).length;
    const newOpportunitiesCount = opportunities.filter((o) => o.status === "NEW").length;

    const todaysIntelligence = [...intelligenceItems]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 8);

    const actionRequired = tasks
      .filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS")
      .map(enrichTask)
      .sort((a, b) => {
        const priorityWeight = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      })
      .slice(0, 6);

    const newOpportunities = opportunities
      .filter((o) => o.status === "NEW")
      .map((o) => ({ ...o, clientName: getClient(o.clientId)?.name ?? "—" }));

    return {
      stats: {
        activeDeals,
        totalDealValueMinorUnits,
        dealsRequiringAttention,
        newOpportunities: newOpportunitiesCount,
        dealsAdvanced,
        dealsAtRisk,
      },
      todaysIntelligence,
      actionRequired,
      newOpportunities,
    };
  },
};
