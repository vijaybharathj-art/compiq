// Repository contracts. Demo Mode (demo-repository.ts) implements these
// against in-memory fixtures; a future prisma-repository.ts implements the
// same contracts against PostgreSQL. Pages/components only ever import
// from `./index`, never a concrete implementation.

import type {
  Banker,
  BankingServiceCode,
  Client,
  Contact,
  Deal,
  DealEvent,
  DealPriority,
  DealType,
  IntelligenceCategory,
  IntelligenceItem,
  Opportunity,
  RiskStatus,
  Sector,
  Task,
  TaskStatus,
} from "@/types/domain";

export interface DealListItem extends Deal {
  clientName: string;
  currentStageLabel: string;
  previousStageLabel?: string;
  leadBankerName: string;
  sectorName: string;
}

export interface DealEmailView {
  id: string;
  fromName: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  receivedAt: string;
  relevance: string;
  aiInterpretation?: { summary: string; confidencePercent: number };
}

export interface DealDetail extends DealListItem {
  client: Client;
  leadBanker: Banker;
  teamMembers: { banker: Banker; role: string }[];
  timeline: DealEvent[];
  tasks: Task[];
  emails: DealEmailView[];
  intelligence: IntelligenceItem[];
}

export interface DealFilters {
  bankingService?: BankingServiceCode;
  dealType?: DealType;
  sectorId?: string;
  priority?: DealPriority;
  riskStatus?: RiskStatus;
  clientId?: string;
  query?: string;
}

export interface ClientListItem extends Client {
  sectorName: string;
  activeDealCount: number;
  totalDealValueMinorUnits: number;
  primaryBankerName: string;
}

export interface ClientDetail extends ClientListItem {
  deals: DealListItem[];
  opportunities: Opportunity[];
  recentIntelligence: IntelligenceItem[];
  contacts: Contact[];
}

export interface TaskListItem extends Task {
  dealCodename?: string;
  clientName?: string;
  ownerName: string;
}

export interface DashboardStats {
  activeDeals: number;
  totalDealValueMinorUnits: number;
  dealsRequiringAttention: number;
  newOpportunities: number;
  dealsAdvanced: number;
  dealsAtRisk: number;
}

export interface DashboardData {
  stats: DashboardStats;
  todaysIntelligence: IntelligenceItem[];
  actionRequired: TaskListItem[];
  newOpportunities: (Opportunity & { clientName: string })[];
}

export interface DealRepository {
  list(filters?: DealFilters): Promise<DealListItem[]>;
  get(id: string): Promise<DealDetail | null>;
}

export interface ClientRepository {
  list(): Promise<ClientListItem[]>;
  get(id: string): Promise<ClientDetail | null>;
}

export interface TaskRepository {
  list(filters?: { status?: TaskStatus; dealId?: string; clientId?: string }): Promise<TaskListItem[]>;
}

export interface IntelligenceRepository {
  list(category?: IntelligenceCategory): Promise<(IntelligenceItem & { dealCodename?: string; clientName?: string })[]>;
}

export interface DashboardRepository {
  get(): Promise<DashboardData>;
}

export interface ReferenceRepository {
  sectors(): Promise<Sector[]>;
  bankers(): Promise<Banker[]>;
}

export interface AuditLogEntryView {
  id: string;
  actorName: string;
  action: string;
  entityLabel: string;
  entityHref?: string;
  metadata?: string;
  occurredAt: string;
}

export interface AuditLogRepository {
  list(): Promise<AuditLogEntryView[]>;
}

export interface NotificationView {
  id: string;
  title: string;
  body?: string;
  linkHref?: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationRepository {
  listForUser(userId: string): Promise<NotificationView[]>;
}
