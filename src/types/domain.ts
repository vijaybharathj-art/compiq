// Domain types shared between the demo data layer and the (future) Prisma-
// backed repository implementation. Field names intentionally mirror
// prisma/schema.prisma so the eventual swap is a drop-in.

export type BankingServiceCode =
  | "MA"
  | "ECM"
  | "DCM"
  | "LEVERAGED_FINANCE"
  | "RESTRUCTURING"
  | "PRIVATE_CAPITAL"
  | "FINANCIAL_ADVISORY"
  | "STRATEGIC_ADVISORY"
  | "VALUATION"
  | "OTHER";

export interface BankingService {
  id: BankingServiceCode;
  name: string;
}

export type DealType =
  | "BUY_SIDE_MA"
  | "SELL_SIDE_MA"
  | "MERGER"
  | "ACQUISITION"
  | "DIVESTITURE"
  | "TAKE_PRIVATE"
  | "IPO"
  | "FOLLOW_ON"
  | "RIGHTS_ISSUE"
  | "CONVERTIBLE"
  | "BOND_ISSUANCE"
  | "PRIVATE_PLACEMENT"
  | "ACQUISITION_FINANCING"
  | "REFINANCING"
  | "LEVERAGED_BUYOUT"
  | "RESTRUCTURING"
  | "JOINT_VENTURE"
  | "STRATEGIC_INVESTMENT"
  | "OTHER";

export type DealSide = "BUY_SIDE" | "SELL_SIDE" | "N_A";
export type MandateStatus = "NOT_MANDATED" | "MANDATED" | "CO_MANDATED" | "LOST";
export type DealPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskStatus = "ON_TRACK" | "WATCH" | "AT_RISK";
export type ClientRelationship = "ACTIVE" | "DORMANT" | "PROSPECT" | "FORMER";
export type DealParticipantRole =
  | "BUYER"
  | "SELLER"
  | "INVESTOR"
  | "LENDER"
  | "LAW_FIRM"
  | "ACCOUNTANT"
  | "TARGET"
  | "ADVISOR_OTHER";
export type DealTeamRole = "LEAD_BANKER" | "MD" | "VP" | "ASSOCIATE" | "ANALYST";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";
export type OpportunityStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "CONVERTED_TO_DEAL"
  | "DISMISSED";
export type EmailRelevance = "IB_RELEVANT" | "POSSIBLY_RELEVANT" | "NOT_RELEVANT";
export type DealEventType =
  | "STAGE_CHANGE"
  | "VALUE_CHANGE"
  | "PARTICIPANT_ADDED"
  | "RISK_FLAGGED"
  | "MILESTONE"
  | "NOTE";
export type IntelligenceCategory =
  | "DEAL_CHANGE"
  | "CLIENT_ACTIVITY"
  | "TASK"
  | "OPPORTUNITY"
  | "RISK"
  | "IMPORTANT_EMAIL";

export interface Money {
  amountMinorUnits: number;
  currency: string;
}

export interface Evidence {
  id: string;
  senderName: string;
  senderEmail: string;
  sentAt: string; // ISO
  subject: string;
  quotedExcerpt: string;
  emailId: string;
}

export interface Banker {
  id: string;
  name: string;
  initials: string;
  title: string;
  team: BankingServiceCode;
  email: string;
}

export interface Sector {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  email: string;
  phone?: string;
  isKeyContact: boolean;
}

export interface Client {
  id: string;
  name: string;
  relationshipStatus: ClientRelationship;
  sectorId: string;
  headquarters: string;
  website: string;
  foundedYear?: number;
  primaryBankerId: string;
  contacts: Contact[];
  lastInteractionAt: string; // ISO
}

export interface DealStageDefinition {
  key: string;
  label: string;
  sortOrder: number;
}

export interface DealWorkflow {
  bankingServiceId: BankingServiceCode;
  stages: DealStageDefinition[];
}

export interface DealParticipant {
  id: string;
  companyName: string;
  role: DealParticipantRole;
}

export interface DealTeamMember {
  bankerId: string;
  role: DealTeamRole;
}

export interface DealEvent {
  id: string;
  dealId: string;
  type: DealEventType;
  previousValue?: string;
  newValue?: string;
  occurredAt: string; // ISO
  note: string;
  evidence?: Evidence;
  confidencePercent?: number;
}

export interface Deal {
  id: string;
  projectCodename: string;
  clientId: string;
  targetCompanyName?: string;
  sectorId: string;
  geography: string;
  bankingServiceId: BankingServiceCode;
  dealType: DealType;
  side: DealSide;
  value?: Money;
  enterpriseValue?: Money;
  equityValue?: Money;
  previousValue?: Money;
  workflowStages: DealStageDefinition[];
  currentStageKey: string;
  previousStageKey?: string;
  mandateStatus: MandateStatus;
  probabilityPercent: number;
  leadBankerId: string;
  team: DealTeamMember[];
  participants: DealParticipant[];
  createdAt: string;
  lastActivityAt: string;
  nextMilestone?: string;
  nextMilestoneDate?: string;
  expectedCloseDate?: string;
  priority: DealPriority;
  riskStatus: RiskStatus;
  riskNote?: string;
  aiConfidencePercent: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dealId?: string;
  clientId?: string;
  ownerId: string;
  priority: DealPriority;
  dueDate?: string;
  status: TaskStatus;
  sourceEvidence?: Evidence;
  aiConfidencePercent?: number;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  clientId: string;
  potentialServiceId: BankingServiceCode;
  signalText: string;
  confidencePercent: number;
  recommendedAction: string;
  status: OpportunityStatus;
  sourceEvidence: Evidence;
  createdAt: string;
}

export interface IntelligenceItem {
  id: string;
  category: IntelligenceCategory;
  dealId?: string;
  clientId?: string;
  headline: string;
  detail?: string;
  delta?: { from: string; to: string };
  confidencePercent?: number;
  evidence?: Evidence;
  occurredAt: string; // ISO
}
