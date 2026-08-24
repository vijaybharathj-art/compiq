import { getPrismaClient } from "@/lib/db";
import type {
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
  AuditLogRepository,
  NotificationRepository,
  TaskListItem,
  TaskRepository,
} from "./types";
import type {
  DealEvent,
  Evidence,
  IntelligenceItem,
  Money,
  Task,
  RiskStatus,
} from "@/types/domain";

const db = getPrismaClient();

// ---------------------------------------------------------------------------
// Shared mapping helpers
// ---------------------------------------------------------------------------

function toMoney(minorUnits: bigint | null | undefined, currency: string): Money | undefined {
  if (minorUnits === null || minorUnits === undefined) return undefined;
  return { amountMinorUnits: Number(minorUnits), currency };
}

function toEvidence(email: {
  id: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
} | null): Evidence | undefined {
  if (!email) return undefined;
  return {
    id: `evidence-${email.id}`,
    senderName: email.fromName ?? email.fromAddress,
    senderEmail: email.fromAddress,
    sentAt: email.receivedAt.toISOString(),
    subject: email.subject,
    quotedExcerpt: email.bodyText.slice(0, 320),
    emailId: email.id,
  };
}

type DealWithRelations = Awaited<ReturnType<typeof db.deal.findFirstOrThrow<{
  include: {
    client: true;
    sector: true;
    leadBanker: true;
    currentStage: true;
    previousStage: true;
    workflow: { include: { stages: true } };
  };
}>>>;

function enrichDeal(deal: DealWithRelations): DealListItem {
  return {
    id: deal.id,
    projectCodename: deal.projectCodename,
    clientId: deal.clientId,
    clientName: deal.client.name,
    targetCompanyName: undefined,
    sectorId: deal.sectorId ?? "",
    sectorName: deal.sector?.name ?? "—",
    geography: deal.geography ?? "—",
    bankingServiceId: deal.bankingServiceId as DealListItem["bankingServiceId"],
    dealType: deal.dealType,
    side: deal.side,
    value: toMoney(deal.valueMinorUnits, deal.currency),
    enterpriseValue: toMoney(deal.enterpriseValueMinorUnits, deal.currency),
    equityValue: toMoney(deal.equityValueMinorUnits, deal.currency),
    workflowStages: deal.workflow.stages
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ key: s.key, label: s.label, sortOrder: s.sortOrder })),
    currentStageKey: deal.currentStage.key,
    currentStageLabel: deal.currentStage.label,
    previousStageKey: deal.previousStage?.key,
    previousStageLabel: deal.previousStage?.label,
    mandateStatus: deal.mandateStatus,
    probabilityPercent: deal.probabilityPercent ?? 0,
    leadBankerId: deal.leadBankerId ?? "",
    leadBankerName: deal.leadBanker?.name ?? "Unassigned",
    team: [],
    participants: [],
    createdAt: deal.createdAt.toISOString(),
    lastActivityAt: deal.lastActivityAt.toISOString(),
    nextMilestone: deal.nextMilestone ?? undefined,
    nextMilestoneDate: deal.nextMilestoneDate?.toISOString(),
    expectedCloseDate: deal.expectedCloseDate?.toISOString(),
    priority: deal.priority,
    riskStatus: deal.riskStatus,
    aiConfidencePercent: deal.aiConfidencePercent ?? 0,
  };
}

const dealInclude = {
  client: true,
  sector: true,
  leadBanker: true,
  currentStage: true,
  previousStage: true,
  workflow: { include: { stages: true } },
} as const;

// ---------------------------------------------------------------------------
// DealRepository
// ---------------------------------------------------------------------------

export const prismaDealRepository: DealRepository = {
  async list(filters?: DealFilters) {
    const where: Record<string, unknown> = {};
    if (filters?.bankingService) where.bankingServiceId = filters.bankingService;
    if (filters?.dealType) where.dealType = filters.dealType;
    if (filters?.sectorId) where.sectorId = filters.sectorId;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.riskStatus) where.riskStatus = filters.riskStatus;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.query) {
      where.OR = [
        { projectCodename: { contains: filters.query, mode: "insensitive" } },
        { client: { name: { contains: filters.query, mode: "insensitive" } } },
      ];
    }

    const deals = await db.deal.findMany({
      where,
      include: dealInclude,
      orderBy: { lastActivityAt: "desc" },
    });
    return deals.map((d) => enrichDeal(d as unknown as DealWithRelations));
  },

  async get(id: string): Promise<DealDetail | null> {
    const deal = await db.deal.findUnique({
      where: { id },
      include: {
        ...dealInclude,
        targetCompany: true,
        team: { include: { user: true } },
        participants: { include: { company: true } },
        events: { orderBy: { occurredAt: "desc" }, include: { sourceEmail: true } },
        tasks: true,
      },
    });
    if (!deal) return null;

    const enriched = enrichDeal(deal as unknown as DealWithRelations);
    const titleIds = [deal.leadBankerId, ...deal.team.map((t) => t.userId)].filter(
      (x): x is string => !!x,
    );
    const titleById = await titleMap(titleIds);

    const timeline: DealEvent[] = deal.events.map((e) => ({
      id: e.id,
      dealId: e.dealId,
      type: e.type,
      previousValue: e.previousValue ?? undefined,
      newValue: e.newValue ?? undefined,
      occurredAt: e.occurredAt.toISOString(),
      note: e.note ?? "",
      evidence: toEvidence(e.sourceEmail),
    }));

    const tasks: Task[] = deal.tasks.map(mapTask);

    const [emailRows, intelligenceRows] = await Promise.all([
      db.email.findMany({
        where: { thread: { dealId: id } },
        include: { aiExtractions: true },
        orderBy: { receivedAt: "desc" },
      }),
      db.intelligenceEvent.findMany({
        where: { dealId: id },
        include: { sourceEmail: true },
        orderBy: { occurredAt: "desc" },
      }),
    ]);

    const emails = emailRows.map((e) => {
      const extraction = e.aiExtractions[0];
      return {
        id: e.id,
        fromName: e.fromName ?? e.fromAddress,
        fromAddress: e.fromAddress,
        toAddresses: e.toAddresses,
        subject: e.subject,
        bodyText: e.bodyText,
        receivedAt: e.receivedAt.toISOString(),
        relevance: e.relevance,
        aiInterpretation: extraction
          ? { summary: describeExtraction(extraction.matchType), confidencePercent: extraction.confidencePercent }
          : undefined,
      };
    });

    const intelligence = intelligenceRows.map(mapIntelligenceRow);

    return {
      ...enriched,
      targetCompanyName: deal.targetCompany?.name,
      client: {
        id: deal.client.id,
        name: deal.client.name,
        relationshipStatus: deal.client.relationshipStatus,
        sectorId: deal.client.sectorId ?? "",
        headquarters: deal.client.headquarters ?? "",
        website: deal.client.website ?? "",
        foundedYear: deal.client.foundedYear ?? undefined,
        primaryBankerId: deal.client.primaryBankerId ?? "",
        contacts: [],
        lastInteractionAt: deal.client.updatedAt.toISOString(),
      },
      leadBanker: {
        id: deal.leadBanker?.id ?? "",
        name: deal.leadBanker?.name ?? "Unassigned",
        initials: initials(deal.leadBanker?.name ?? "NA"),
        title: (deal.leadBankerId && titleById.get(deal.leadBankerId)) ?? "",
        team: deal.bankingServiceId as DealListItem["bankingServiceId"],
        email: deal.leadBanker?.email ?? "",
      },
      teamMembers: deal.team.map((t) => ({
        banker: {
          id: t.user.id,
          name: t.user.name ?? t.user.email,
          initials: initials(t.user.name ?? t.user.email),
          title: titleById.get(t.userId) ?? "",
          team: deal.bankingServiceId as DealListItem["bankingServiceId"],
          email: t.user.email,
        },
        role: t.role,
      })),
      participants: deal.participants.map((p) => ({
        id: p.id,
        companyName: p.company.name,
        role: p.role,
      })),
      timeline,
      tasks,
      emails,
      intelligence,
    };
  },
};

function describeExtraction(matchType: string): string {
  switch (matchType) {
    case "EXISTING_DEAL":
      return "Detected: content related to this deal's status or terms";
    case "NEW_DEAL_EXISTING_CLIENT":
      return "Detected: possible new deal for an existing client";
    case "NEW_CLIENT":
      return "Detected: possible new client relationship";
    case "POTENTIAL_OPPORTUNITY":
      return "Detected: potential origination opportunity";
    default:
      return "Detected: content of uncertain relevance";
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function mapTask(t: {
  id: string;
  title: string;
  description: string | null;
  dealId: string | null;
  clientId: string | null;
  ownerId: string | null;
  priority: string;
  dueDate: Date | null;
  status: string;
  aiConfidencePercent: number | null;
  createdAt: Date;
}): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    dealId: t.dealId ?? undefined,
    clientId: t.clientId ?? undefined,
    ownerId: t.ownerId ?? "",
    priority: t.priority as Task["priority"],
    dueDate: t.dueDate?.toISOString(),
    status: t.status as Task["status"],
    aiConfidencePercent: t.aiConfidencePercent ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// ClientRepository
// ---------------------------------------------------------------------------

export const prismaClientRepository: ClientRepository = {
  async list(): Promise<ClientListItem[]> {
    const clients = await db.client.findMany({
      include: {
        sector: true,
        deals: { include: { currentStage: { select: { key: true } } } },
      },
      orderBy: { name: "asc" },
    });
    const bankerIds = [...new Set(clients.map((c) => c.primaryBankerId).filter(Boolean))] as string[];
    const bankersById = await bankerMap(bankerIds);

    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      relationshipStatus: c.relationshipStatus,
      sectorId: c.sectorId ?? "",
      sectorName: c.sector?.name ?? "—",
      headquarters: c.headquarters ?? "",
      website: c.website ?? "",
      foundedYear: c.foundedYear ?? undefined,
      primaryBankerId: c.primaryBankerId ?? "",
      primaryBankerName: (c.primaryBankerId && bankersById.get(c.primaryBankerId)) ?? "Unassigned",
      contacts: [],
      lastInteractionAt: c.updatedAt.toISOString(),
      activeDealCount: c.deals.filter((d) => d.currentStage.key !== "closing").length,
      totalDealValueMinorUnits: c.deals.reduce((sum, d) => sum + Number(d.valueMinorUnits ?? 0n), 0),
    }));
  },

  async get(id: string): Promise<ClientDetail | null> {
    const client = await db.client.findUnique({
      where: { id },
      include: {
        sector: true,
        contacts: true,
        deals: { include: dealInclude, orderBy: { lastActivityAt: "desc" } },
        opportunities: { include: { potentialService: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!client) return null;

    const bankerName = client.primaryBankerId
      ? ((await bankerMap([client.primaryBankerId])).get(client.primaryBankerId) ?? "Unassigned")
      : "Unassigned";

    const intelligenceRows = await db.intelligenceEvent.findMany({
      where: { clientId: id },
      include: { sourceEmail: true },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });

    return {
      id: client.id,
      name: client.name,
      relationshipStatus: client.relationshipStatus,
      sectorId: client.sectorId ?? "",
      sectorName: client.sector?.name ?? "—",
      headquarters: client.headquarters ?? "",
      website: client.website ?? "",
      foundedYear: client.foundedYear ?? undefined,
      primaryBankerId: client.primaryBankerId ?? "",
      primaryBankerName: bankerName,
      contacts: client.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title ?? "",
        email: c.email ?? "",
        phone: c.phone ?? undefined,
        isKeyContact: c.isKeyContact,
      })),
      lastInteractionAt: client.updatedAt.toISOString(),
      activeDealCount: client.deals.filter((d) => d.currentStage.key !== "closing").length,
      totalDealValueMinorUnits: client.deals.reduce((sum, d) => sum + Number(d.valueMinorUnits ?? 0n), 0),
      deals: client.deals.map((d) => enrichDeal(d as unknown as DealWithRelations)),
      opportunities: client.opportunities.map((o) => ({
        id: o.id,
        clientId: o.clientId,
        potentialServiceId: o.potentialServiceId as DealListItem["bankingServiceId"],
        signalText: o.signalText,
        confidencePercent: o.confidencePercent,
        recommendedAction: o.recommendedAction,
        status: o.status,
        sourceEvidence: {
          id: `evidence-opp-${o.id}`,
          senderName: "",
          senderEmail: "",
          sentAt: o.createdAt.toISOString(),
          subject: "",
          quotedExcerpt: o.signalText,
          emailId: "",
        },
        createdAt: o.createdAt.toISOString(),
      })),
      recentIntelligence: intelligenceRows.map(mapIntelligenceRow),
    };
  },
};

async function bankerMap(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids } } });
  return new Map(users.map((u) => [u.id, u.name ?? u.email]));
}

async function titleMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const members = await db.organizationMember.findMany({ where: { userId: { in: userIds } } });
  return new Map(members.map((m) => [m.userId, m.title ?? ""]));
}

// ---------------------------------------------------------------------------
// TaskRepository
// ---------------------------------------------------------------------------

export const prismaTaskRepository: TaskRepository = {
  async list(filters): Promise<TaskListItem[]> {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.dealId) where.dealId = filters.dealId;
    if (filters?.clientId) where.clientId = filters.clientId;

    const tasks = await db.task.findMany({
      where,
      include: { deal: true, client: true, owner: true },
      orderBy: [{ dueDate: "asc" }],
    });

    return tasks.map((t) => ({
      ...mapTask(t),
      dealCodename: t.deal?.projectCodename,
      clientName: t.client?.name,
      ownerName: t.owner?.name ?? t.owner?.email ?? "Unassigned",
    }));
  },
};

// ---------------------------------------------------------------------------
// IntelligenceRepository
// ---------------------------------------------------------------------------

function mapIntelligenceRow(row: {
  id: string;
  category: string;
  dealId: string | null;
  clientId: string | null;
  headline: string;
  detail: string | null;
  deltaFrom: string | null;
  deltaTo: string | null;
  confidencePercent: number | null;
  occurredAt: Date;
  reviewStatus: string;
  sourceEmail: {
    id: string;
    fromName: string | null;
    fromAddress: string;
    subject: string;
    bodyText: string;
    receivedAt: Date;
  } | null;
}): IntelligenceItem {
  return {
    id: row.id,
    category: row.category as IntelligenceItem["category"],
    dealId: row.dealId ?? undefined,
    clientId: row.clientId ?? undefined,
    headline: row.headline,
    detail: row.detail ?? undefined,
    delta: row.deltaFrom && row.deltaTo ? { from: row.deltaFrom, to: row.deltaTo } : undefined,
    confidencePercent: row.confidencePercent ?? undefined,
    evidence: toEvidence(row.sourceEmail),
    occurredAt: row.occurredAt.toISOString(),
    reviewStatus: row.reviewStatus as IntelligenceItem["reviewStatus"],
  };
}

export const prismaIntelligenceRepository: IntelligenceRepository = {
  async list(category) {
    const rows = await db.intelligenceEvent.findMany({
      where: category ? { category } : undefined,
      include: { sourceEmail: true, deal: true, client: true },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      ...mapIntelligenceRow(r),
      dealCodename: r.deal?.projectCodename,
      clientName: r.client?.name,
    }));
  },
};

// ---------------------------------------------------------------------------
// DashboardRepository
// ---------------------------------------------------------------------------

export const prismaDashboardRepository: DashboardRepository = {
  async get(): Promise<DashboardData> {
    const [
      activeDeals,
      dealsAtRisk,
      dealsWatch,
      criticalDeals,
      dealsAdvanced,
      valueAgg,
      newOpportunitiesCount,
      todaysIntelligenceRows,
      actionRequiredRows,
      newOpportunityRows,
    ] = await Promise.all([
      db.deal.count(),
      db.deal.count({ where: { riskStatus: "AT_RISK" } }),
      db.deal.count({ where: { riskStatus: "WATCH" } }),
      db.deal.count({ where: { priority: "CRITICAL" } }),
      db.deal.count({ where: { previousStageId: { not: null } } }),
      db.deal.aggregate({ _sum: { valueMinorUnits: true } }),
      db.opportunity.count({ where: { status: "NEW" } }),
      db.intelligenceEvent.findMany({
        include: { sourceEmail: true, deal: true, client: true },
        orderBy: { occurredAt: "desc" },
        take: 8,
      }),
      db.task.findMany({
        where: { status: { in: ["TODO", "IN_PROGRESS"] } },
        include: { deal: true, client: true, owner: true },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        take: 6,
      }),
      db.opportunity.findMany({
        where: { status: "NEW" },
        include: { client: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const riskStatusSet: RiskStatus[] = ["AT_RISK", "WATCH"];
    void riskStatusSet;

    return {
      stats: {
        activeDeals,
        totalDealValueMinorUnits: Number(valueAgg._sum.valueMinorUnits ?? 0n),
        dealsRequiringAttention: dealsAtRisk + dealsWatch + criticalDeals,
        newOpportunities: newOpportunitiesCount,
        dealsAdvanced,
        dealsAtRisk,
      },
      todaysIntelligence: todaysIntelligenceRows.map((r) => ({
        ...mapIntelligenceRow(r),
        dealCodename: r.deal?.projectCodename,
        clientName: r.client?.name,
      })),
      actionRequired: actionRequiredRows.map((t) => ({
        ...mapTask(t),
        dealCodename: t.deal?.projectCodename,
        clientName: t.client?.name,
        ownerName: t.owner?.name ?? t.owner?.email ?? "Unassigned",
      })),
      newOpportunities: newOpportunityRows.map((o) => ({
        id: o.id,
        clientId: o.clientId,
        potentialServiceId: o.potentialServiceId as DealListItem["bankingServiceId"],
        signalText: o.signalText,
        confidencePercent: o.confidencePercent,
        recommendedAction: o.recommendedAction,
        status: o.status,
        sourceEvidence: {
          id: `evidence-opp-${o.id}`,
          senderName: "",
          senderEmail: "",
          sentAt: o.createdAt.toISOString(),
          subject: "",
          quotedExcerpt: o.signalText,
          emailId: "",
        },
        createdAt: o.createdAt.toISOString(),
        clientName: o.client.name,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// ReferenceRepository / AuditLogRepository
// ---------------------------------------------------------------------------

export const prismaReferenceRepository: ReferenceRepository = {
  async sectors() {
    const rows = await db.sector.findMany({ orderBy: { name: "asc" } });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  },
  async bankers() {
    const org = await db.organizationMember.findMany({ include: { user: true } });
    return org.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email,
      initials: initials(m.user.name ?? m.user.email),
      title: m.title ?? "",
      team: (m.team ?? "OTHER") as DealListItem["bankingServiceId"],
      email: m.user.email,
    }));
  },
  async notificationPreferences(userId) {
    const member = await db.organizationMember.findFirst({ where: { userId } });
    return {
      notifyDealChanges: member?.notifyDealChanges ?? true,
      notifyRiskAlerts: member?.notifyRiskAlerts ?? true,
      notifyTaskReminders: member?.notifyTaskReminders ?? true,
      notifyDailyDigest: member?.notifyDailyDigest ?? false,
    };
  },
};

export const prismaNotificationRepository: NotificationRepository = {
  async listForUser(userId: string) {
    const rows = await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body ?? undefined,
      linkHref: r.linkHref ?? undefined,
      readAt: r.readAt?.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  },
};

export const prismaAuditLogRepository: AuditLogRepository = {
  async list() {
    const rows = await db.auditLog.findMany({
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const dealIds = rows.filter((r) => r.entityType === "Deal").map((r) => r.entityId);
    const deals = dealIds.length
      ? await db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, projectCodename: true } })
      : [];
    const dealNameById = new Map(deals.map((d) => [d.id, d.projectCodename]));

    return rows.map((r) => ({
      id: r.id,
      actorName: r.actor?.name ?? r.actor?.email ?? "Tattava AI",
      action: r.action,
      entityLabel: dealNameById.get(r.entityId) ?? r.entityId,
      entityHref: dealNameById.has(r.entityId) ? `/deals/${r.entityId}` : undefined,
      metadata: r.metadata ? JSON.stringify(r.metadata) : undefined,
      occurredAt: r.createdAt.toISOString(),
    }));
  },
};
