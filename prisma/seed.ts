import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { bankers } from "@/lib/data/fixtures/bankers";
import { clients as clientFixtures } from "@/lib/data/fixtures/clients";
import { sectors } from "@/lib/data/fixtures/sectors";
import { bankingServices, workflowsByService } from "@/lib/data/fixtures/workflows";
import { deals as heroDeals } from "@/lib/data/fixtures/deals";
import { dealEvents as heroDealEvents } from "@/lib/data/fixtures/deal-events";
import { tasks as heroTasks } from "@/lib/data/fixtures/tasks";
import { opportunities as heroOpportunities } from "@/lib/data/fixtures/opportunities";
import { intelligenceItems as heroIntelligence } from "@/lib/data/fixtures/intelligence";
import { organization as orgFixture } from "@/lib/data/fixtures/organization";
import { auditLogEntries as heroAuditLog } from "@/lib/data/fixtures/audit-log";
import { DEMO_ORG_ID } from "@/lib/constants";

import { companyPool, companiesByArchetype } from "./seed/companies";
import { createRng, pick, randomInt, daysAgoIso, daysFromIso } from "./seed/rng";
import { generateFillerEmail, FILLER_TASK_TITLES, MILESTONE_NOTE_TEMPLATES } from "./seed/templates";
import { buildBacklogEmails, type DealRef, type ContactRef } from "./seed/backlog";
import type {
  BankingServiceCode,
  DealParticipantRole,
  DealPriority,
  DealTeamRole,
  DealType,
  RiskStatus,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const NOW = "2026-08-23T18:00:00Z";
const rng = createRng(1337);
const ORG_ID = DEMO_ORG_ID;

function usd(minorUnits: number): bigint {
  return BigInt(Math.round(minorUnits));
}

function moneyLabel(minorUnits: number | bigint): string {
  const dollars = Number(minorUnits) / 100;
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(dollars % 1_000_000_000 === 0 ? 0 : 1)}B`;
  return `$${Math.round(dollars / 1_000_000)}M`;
}

function toBankingTeam(code: BankingServiceCode): string {
  if (code === "FINANCIAL_ADVISORY" || code === "STRATEGIC_ADVISORY" || code === "VALUATION" || code === "OTHER") {
    return "ADVISORY";
  }
  return code;
}

async function main() {
  console.log("Resetting existing data...");
  await resetDatabase();

  console.log("Seeding organization, reference data...");
  await seedOrganizationAndReferenceData();

  console.log("Seeding workflows/stages...");
  const stagesByService = await seedWorkflowsAndStages();

  console.log("Seeding clients, contacts, companies...");
  await seedClientsAndCompanies();

  console.log("Seeding deals (hero + filler)...");
  const { allDeals, fillerDealIds } = await seedDeals(stagesByService);

  console.log("Seeding deal teams & participants...");
  await seedDealTeamsAndParticipants(allDeals);

  console.log("Seeding email account, threads & emails...");
  const emailIndex = await seedEmailsAndThreads(allDeals);

  console.log("Seeding unprocessed email backlog (for Run Scan)...");
  await seedBacklogEmails(allDeals, stagesByService);

  console.log("Seeding AI extractions & evidence...");
  await seedAiExtractions(allDeals, emailIndex);

  console.log("Seeding deal timeline events...");
  await seedDealEvents(allDeals, fillerDealIds, emailIndex);

  console.log("Seeding intelligence feed...");
  await seedIntelligenceEvents(allDeals, fillerDealIds, emailIndex);

  console.log("Seeding tasks...");
  await seedTasks(allDeals, fillerDealIds);

  console.log("Seeding opportunities...");
  await seedOpportunities();

  console.log("Seeding meetings...");
  await seedMeetings(allDeals);

  console.log("Seeding notifications...");
  await seedNotifications();

  console.log("Seeding audit log...");
  await seedAuditLog(fillerDealIds);

  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs", "notifications", "meetings", "opportunities", "tasks",
      "intelligence_events", "deal_events", "ai_extraction_evidence",
      "ai_extractions", "email_attachments", "emails", "email_threads",
      "email_accounts", "deal_participants", "deal_team_members", "deals",
      "deal_stage_definitions", "deal_workflows", "contacts", "companies",
      "clients", "organization_members", "banking_services", "sectors",
      "sessions", "accounts", "users", "organizations"
    RESTART IDENTITY CASCADE;
  `);
}

// ---------------------------------------------------------------------------
// Organization, sectors, banking services, users
// ---------------------------------------------------------------------------

async function seedOrganizationAndReferenceData() {
  await prisma.organization.create({
    data: { id: ORG_ID, name: orgFixture.name, slug: orgFixture.slug, plan: orgFixture.plan },
  });

  await prisma.sector.createMany({
    data: sectors.map((s) => ({ id: s.id, name: s.name })),
  });

  await prisma.bankingService.createMany({
    data: bankingServices.map((s) => ({ id: s.id, code: s.id, name: s.name })),
  });

  await prisma.user.createMany({
    data: bankers.map((b) => ({
      id: b.id,
      email: b.email,
      name: b.name,
      authProvider: "GOOGLE" as const,
    })),
  });

  await prisma.organizationMember.createMany({
    data: bankers.map((b) => ({
      organizationId: ORG_ID,
      userId: b.id,
      role: b.id === "banker-bharath" ? ("OWNER" as const) : ("BANKER" as const),
      team: toBankingTeam(b.team) as
        | "MA"
        | "ECM"
        | "DCM"
        | "LEVERAGED_FINANCE"
        | "RESTRUCTURING"
        | "PRIVATE_CAPITAL"
        | "ADVISORY",
      title: b.title,
    })),
  });
}

// ---------------------------------------------------------------------------
// Deal workflows & stage definitions
// ---------------------------------------------------------------------------

type StageMap = Record<BankingServiceCode, { id: string; key: string; label: string; sortOrder: number }[]>;

async function seedWorkflowsAndStages(): Promise<StageMap> {
  const stagesByService = {} as StageMap;

  for (const service of bankingServices) {
    const workflowId = `wf-${service.id.toLowerCase()}`;
    await prisma.dealWorkflow.create({
      data: {
        id: workflowId,
        organizationId: null,
        bankingServiceId: service.id,
        name: `${service.name} Standard Workflow`,
      },
    });

    const stages = workflowsByService[service.id];
    const created = await Promise.all(
      stages.map((s) =>
        prisma.dealStageDefinition.create({
          data: {
            id: `stage-${service.id.toLowerCase()}-${s.key}`,
            workflowId,
            key: s.key,
            label: s.label,
            sortOrder: s.sortOrder,
          },
        }),
      ),
    );
    stagesByService[service.id] = created.map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      sortOrder: c.sortOrder,
    }));
  }

  return stagesByService;
}

// ---------------------------------------------------------------------------
// Clients, contacts, companies
// ---------------------------------------------------------------------------

async function seedClientsAndCompanies() {
  await prisma.client.createMany({
    data: clientFixtures.map((c) => ({
      id: c.id,
      organizationId: ORG_ID,
      name: c.name,
      relationshipStatus: c.relationshipStatus,
      sectorId: c.sectorId,
      primaryBankerId: c.primaryBankerId,
      headquarters: c.headquarters,
      website: c.website,
      foundedYear: c.foundedYear,
    })),
  });

  await prisma.contact.createMany({
    data: clientFixtures.flatMap((c) =>
      c.contacts.map((contact) => ({
        id: contact.id,
        clientId: c.id,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        isKeyContact: contact.isKeyContact,
      })),
    ),
  });

  await prisma.company.createMany({
    data: companyPool.map((c) => ({
      id: c.id,
      organizationId: ORG_ID,
      name: c.name,
      sectorId: c.sectorId,
      isClientEntity: c.isClientEntity ?? false,
    })),
  });
}

// ---------------------------------------------------------------------------
// Deals — hero (curated) + filler (generated)
// ---------------------------------------------------------------------------

const FILLER_CLIENT_PLAN: { clientId: string; count: number }[] = [
  { clientId: "client-acme", count: 1 },
  { clientId: "client-meridian", count: 1 },
  { clientId: "client-vantage", count: 1 },
  { clientId: "client-solace", count: 1 },
  { clientId: "client-nimbus", count: 1 },
  { clientId: "client-halcyon", count: 3 },
  { clientId: "client-brightline", count: 1 },
  { clientId: "client-foxglove", count: 4 },
  { clientId: "client-reliance-grid", count: 3 },
  { clientId: "client-cobalt", count: 3 },
];

const FILLER_SERVICES: BankingServiceCode[] = [
  "MA",
  "ECM",
  "DCM",
  "LEVERAGED_FINANCE",
  "RESTRUCTURING",
  "PRIVATE_CAPITAL",
  "FINANCIAL_ADVISORY",
];

const DEAL_TYPES_BY_SERVICE: Record<BankingServiceCode, DealType[]> = {
  MA: ["BUY_SIDE_MA", "SELL_SIDE_MA", "MERGER", "ACQUISITION", "DIVESTITURE"],
  ECM: ["IPO", "FOLLOW_ON", "RIGHTS_ISSUE", "CONVERTIBLE"],
  DCM: ["BOND_ISSUANCE", "PRIVATE_PLACEMENT"],
  LEVERAGED_FINANCE: ["ACQUISITION_FINANCING", "LEVERAGED_BUYOUT", "REFINANCING"],
  RESTRUCTURING: ["RESTRUCTURING"],
  PRIVATE_CAPITAL: ["STRATEGIC_INVESTMENT", "JOINT_VENTURE"],
  FINANCIAL_ADVISORY: ["OTHER"],
  STRATEGIC_ADVISORY: ["OTHER"],
  VALUATION: ["OTHER"],
  OTHER: ["OTHER"],
};

const CODENAME_POOL = [
  "Aurora", "Beacon", "Cascade", "Denali", "Ember", "Fathom", "Granite", "Harbor",
  "Ironwood", "Juniper", "Kestrel", "Lantern", "Meridian", "Nomad", "Obsidian",
  "Pinnacle", "Quartz", "Ridgeline", "Solstice", "Tundra", "Vertex", "Wraith",
];

const LEAD_BANKER_BY_SERVICE: Record<BankingServiceCode, string> = {
  MA: "banker-schen",
  ECM: "banker-panand",
  DCM: "banker-jwhitfield",
  LEVERAGED_FINANCE: "banker-jwhitfield",
  RESTRUCTURING: "banker-mwebb",
  PRIVATE_CAPITAL: "banker-etorres",
  FINANCIAL_ADVISORY: "banker-treyes",
  STRATEGIC_ADVISORY: "banker-bharath",
  VALUATION: "banker-bharath",
  OTHER: "banker-bharath",
};

interface SeedDeal {
  id: string;
  projectCodename: string;
  organizationId: string;
  clientId: string;
  targetCompanyId: string | null;
  sectorId: string | null;
  geography: string | null;
  bankingServiceId: BankingServiceCode;
  dealType: DealType;
  side: "BUY_SIDE" | "SELL_SIDE" | "N_A";
  valueMinorUnits: bigint | null;
  currency: string;
  enterpriseValueMinorUnits: bigint | null;
  equityValueMinorUnits: bigint | null;
  workflowId: string;
  currentStageId: string;
  currentStageLabel: string;
  previousStageId: string | null;
  mandateStatus: "NOT_MANDATED" | "MANDATED" | "CO_MANDATED" | "LOST";
  probabilityPercent: number | null;
  leadBankerId: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  nextMilestone: string | null;
  nextMilestoneDate: Date | null;
  expectedCloseDate: Date | null;
  priority: DealPriority;
  riskStatus: RiskStatus;
  riskNote: string | null;
  aiConfidencePercent: number | null;
  isHero: boolean;
  clientName: string;
}

async function seedDeals(stagesByService: StageMap) {
  const heroSeedDeals: SeedDeal[] = heroDeals.map((d) => {
    const stages = stagesByService[d.bankingServiceId];
    const current = stages.find((s) => s.key === d.currentStageKey)!;
    const previous = d.previousStageKey ? stages.find((s) => s.key === d.previousStageKey) ?? null : null;
    const client = clientFixtures.find((c) => c.id === d.clientId)!;
    const targetCompany = d.targetCompanyName
      ? companyPool.find((c) => c.name === d.targetCompanyName)
      : undefined;

    return {
      id: d.id,
      projectCodename: d.projectCodename,
      organizationId: ORG_ID,
      clientId: d.clientId,
      targetCompanyId: targetCompany?.id ?? null,
      sectorId: d.sectorId,
      geography: d.geography,
      bankingServiceId: d.bankingServiceId,
      dealType: d.dealType,
      side: d.side,
      valueMinorUnits: d.value ? usd(d.value.amountMinorUnits) : null,
      currency: d.value?.currency ?? "USD",
      enterpriseValueMinorUnits: d.enterpriseValue ? usd(d.enterpriseValue.amountMinorUnits) : null,
      equityValueMinorUnits: d.equityValue ? usd(d.equityValue.amountMinorUnits) : null,
      workflowId: `wf-${d.bankingServiceId.toLowerCase()}`,
      currentStageId: current.id,
      currentStageLabel: current.label,
      previousStageId: previous?.id ?? null,
      mandateStatus: d.mandateStatus,
      probabilityPercent: d.probabilityPercent,
      leadBankerId: d.leadBankerId,
      createdAt: new Date(d.createdAt),
      lastActivityAt: new Date(d.lastActivityAt),
      nextMilestone: d.nextMilestone ?? null,
      nextMilestoneDate: d.nextMilestoneDate ? new Date(d.nextMilestoneDate) : null,
      expectedCloseDate: d.expectedCloseDate ? new Date(d.expectedCloseDate) : null,
      priority: d.priority,
      riskStatus: d.riskStatus,
      riskNote: d.riskNote ?? null,
      aiConfidencePercent: d.aiConfidencePercent ?? null,
      isHero: true,
      clientName: client.name,
    };
  });

  const fillerSeedDeals: SeedDeal[] = [];
  let codenameCursor = 0;

  for (const plan of FILLER_CLIENT_PLAN) {
    const client = clientFixtures.find((c) => c.id === plan.clientId)!;
    for (let i = 0; i < plan.count; i++) {
      const service = pick(rng, FILLER_SERVICES);
      const stages = stagesByService[service];
      const stageIndex = randomInt(rng, 0, stages.length - 1);
      const current = stages[stageIndex]!;
      const previous = stageIndex > 0 ? stages[stageIndex - 1]! : null;
      const dealType = pick(rng, DEAL_TYPES_BY_SERVICE[service]);
      const codename = `Project ${CODENAME_POOL[codenameCursor % CODENAME_POOL.length]}`;
      codenameCursor++;

      const valueMinor = usd(randomInt(rng, 80, 1200) * 1_000_000 * 100);
      const createdDaysAgo = randomInt(rng, 20, 160);
      const lastActivityDaysAgo = randomInt(rng, 0, 12);
      const riskRoll = rng();
      const riskStatus: RiskStatus = riskRoll > 0.85 ? "AT_RISK" : riskRoll > 0.65 ? "WATCH" : "ON_TRACK";
      const priorityRoll = rng();
      const priority: DealPriority =
        priorityRoll > 0.85 ? "CRITICAL" : priorityRoll > 0.6 ? "HIGH" : priorityRoll > 0.25 ? "MEDIUM" : "LOW";
      const isClosed = current.key === "closing";

      fillerSeedDeals.push({
        id: `deal-filler-${plan.clientId}-${i}-${codenameCursor}`,
        projectCodename: codename,
        organizationId: ORG_ID,
        clientId: plan.clientId,
        targetCompanyId: null,
        sectorId: client.sectorId,
        geography: pick(rng, ["North America", "Europe", "Asia-Pacific", "Latin America"]),
        bankingServiceId: service,
        dealType,
        side: service === "MA" ? pick(rng, ["BUY_SIDE", "SELL_SIDE"] as const) : "N_A",
        valueMinorUnits: valueMinor,
        currency: "USD",
        enterpriseValueMinorUnits: service === "MA" ? valueMinor : null,
        equityValueMinorUnits: null,
        workflowId: `wf-${service.toLowerCase()}`,
        currentStageId: current.id,
        currentStageLabel: current.label,
        previousStageId: previous?.id ?? null,
        mandateStatus: stageIndex >= 2 ? "MANDATED" : "NOT_MANDATED",
        probabilityPercent: randomInt(rng, 20, 90),
        leadBankerId: LEAD_BANKER_BY_SERVICE[service],
        createdAt: new Date(daysAgoIso(NOW, createdDaysAgo)),
        lastActivityAt: new Date(daysAgoIso(NOW, lastActivityDaysAgo)),
        nextMilestone: isClosed ? null : `Advance ${codename} to ${stages[Math.min(stageIndex + 1, stages.length - 1)]!.label}`,
        nextMilestoneDate: isClosed ? null : new Date(daysFromIso(NOW, randomInt(rng, 2, 21))),
        expectedCloseDate: new Date(daysFromIso(NOW, randomInt(rng, 20, 200))),
        priority,
        riskStatus: isClosed ? "ON_TRACK" : riskStatus,
        riskNote: riskStatus === "AT_RISK" ? "Extended period without counterparty response." : null,
        aiConfidencePercent: randomInt(rng, 68, 97),
        isHero: false,
        clientName: client.name,
      });
    }
  }

  const allDeals = [...heroSeedDeals, ...fillerSeedDeals];

  await prisma.deal.createMany({
    data: allDeals.map((d) => ({
      id: d.id,
      organizationId: d.organizationId,
      projectCodename: d.projectCodename,
      clientId: d.clientId,
      targetCompanyId: d.targetCompanyId,
      sectorId: d.sectorId,
      geography: d.geography,
      bankingServiceId: d.bankingServiceId,
      dealType: d.dealType,
      side: d.side,
      valueMinorUnits: d.valueMinorUnits,
      currency: d.currency,
      enterpriseValueMinorUnits: d.enterpriseValueMinorUnits,
      equityValueMinorUnits: d.equityValueMinorUnits,
      workflowId: d.workflowId,
      currentStageId: d.currentStageId,
      previousStageId: d.previousStageId,
      mandateStatus: d.mandateStatus,
      probabilityPercent: d.probabilityPercent,
      leadBankerId: d.leadBankerId,
      createdAt: d.createdAt,
      lastActivityAt: d.lastActivityAt,
      nextMilestone: d.nextMilestone,
      nextMilestoneDate: d.nextMilestoneDate,
      expectedCloseDate: d.expectedCloseDate,
      priority: d.priority,
      riskStatus: d.riskStatus,
      aiConfidencePercent: d.aiConfidencePercent,
    })),
  });

  return { allDeals, fillerDealIds: new Set(fillerSeedDeals.map((d) => d.id)) };
}

// ---------------------------------------------------------------------------
// Deal team & participants
// ---------------------------------------------------------------------------

async function seedDealTeamsAndParticipants(allDeals: SeedDeal[]) {
  const heroTeamData = heroDeals.flatMap((d) =>
    d.team.map((t) => ({ dealId: d.id, userId: t.bankerId, role: t.role })),
  );
  const heroParticipantData = heroDeals
    .flatMap((d) =>
      d.participants.map((p) => {
        const company = companyPool.find((c) => c.name === p.companyName);
        return company ? { dealId: d.id, companyId: company.id, role: p.role } : null;
      }),
    )
    .filter((x): x is { dealId: string; companyId: string; role: DealParticipantRole } => x !== null);

  const fillerDeals = allDeals.filter((d) => !d.isHero);
  const fillerTeamData = fillerDeals.flatMap((d) => {
    const analystPool = bankers.filter((b) => b.team === d.bankingServiceId || toBankingTeam(b.team) === toBankingTeam(d.bankingServiceId));
    const secondBanker = pick(rng, analystPool.length > 0 ? analystPool : bankers);
    const rows: { dealId: string; userId: string; role: DealTeamRole }[] = [
      { dealId: d.id, userId: d.leadBankerId!, role: "LEAD_BANKER" },
    ];
    if (secondBanker.id !== d.leadBankerId) {
      rows.push({ dealId: d.id, userId: secondBanker.id, role: "ANALYST" });
    }
    return rows;
  });

  const archetypeForService: Record<string, ("BUYER" | "INVESTOR" | "LENDER" | "LAW_FIRM" | "ADVISOR_OTHER")[]> = {
    MA: ["BUYER", "LAW_FIRM"],
    ECM: ["ADVISOR_OTHER", "LAW_FIRM"],
    DCM: ["LENDER", "LAW_FIRM"],
    LEVERAGED_FINANCE: ["LENDER", "LAW_FIRM"],
    RESTRUCTURING: ["LENDER", "LAW_FIRM"],
    PRIVATE_CAPITAL: ["INVESTOR"],
    FINANCIAL_ADVISORY: ["ADVISOR_OTHER"],
    STRATEGIC_ADVISORY: ["ADVISOR_OTHER"],
    VALUATION: ["ADVISOR_OTHER"],
    OTHER: ["ADVISOR_OTHER"],
  };

  const fillerParticipantData = fillerDeals.flatMap((d) => {
    const archetypes = archetypeForService[d.bankingServiceId] ?? ["ADVISOR_OTHER"];
    return archetypes.map((archetype) => {
      const candidates = companiesByArchetype(
        archetype === "BUYER" ? "BUYER" : archetype === "LENDER" ? "LENDER" : archetype === "INVESTOR" ? "INVESTOR" : archetype === "LAW_FIRM" ? "LAW_FIRM" : "ADVISOR_OTHER",
      );
      const company = pick(rng, candidates.length > 0 ? candidates : companyPool);
      return { dealId: d.id, companyId: company.id, role: archetype };
    });
  });

  await prisma.dealTeamMember.createMany({
    data: [...heroTeamData, ...fillerTeamData],
    skipDuplicates: true,
  });
  await prisma.dealParticipant.createMany({
    data: [...heroParticipantData, ...fillerParticipantData],
  });
}

// ---------------------------------------------------------------------------
// Email account, threads, emails
// ---------------------------------------------------------------------------

interface SeedEmail {
  id: string;
  threadId: string;
  dealId: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
  relevance: "IB_RELEVANT" | "POSSIBLY_RELEVANT" | "NOT_RELEVANT";
  relevanceScore: number;
}

async function seedEmailsAndThreads(allDeals: SeedDeal[]) {
  await prisma.emailAccount.create({
    data: {
      id: "email-account-bharath",
      organizationId: ORG_ID,
      userId: "banker-bharath",
      provider: "GMAIL",
      emailAddress: "bharath.vijay@tattava-demo.bank",
      connectionStatus: "CONNECTED",
      scopesGranted: ["gmail.readonly"],
      lastSyncedAt: new Date(NOW),
    },
  });

  const emails: SeedEmail[] = [];
  const heroEmailIndex = new Map<string, string>(); // fixture emailId -> real email row id

  // Hero deals: reuse the exact evidence quotes from Phase 0 fixtures as the
  // curated "signal" emails, then top up with a couple of filler emails per
  // hero deal for thread depth.
  for (const d of heroDeals) {
    const client = clientFixtures.find((c) => c.id === d.clientId)!;
    const contact = client.contacts[0]!;
    const evidenceEmails = new Map<string, { subject: string; body: string; sentAt: string; sender: string }>();

    for (const evt of heroDealEvents.filter((e) => e.dealId === d.id)) {
      if (evt.evidence) {
        evidenceEmails.set(evt.evidence.emailId, {
          subject: evt.evidence.subject,
          body: evt.evidence.quotedExcerpt,
          sentAt: evt.evidence.sentAt,
          sender: evt.evidence.senderName,
        });
      }
    }
    for (const t of heroTasks.filter((t) => t.dealId === d.id)) {
      if (t.sourceEvidence) {
        evidenceEmails.set(t.sourceEvidence.emailId, {
          subject: t.sourceEvidence.subject,
          body: t.sourceEvidence.quotedExcerpt,
          sentAt: t.sourceEvidence.sentAt,
          sender: t.sourceEvidence.senderName,
        });
      }
    }
    for (const i of heroIntelligence.filter((i) => i.dealId === d.id)) {
      if (i.evidence) {
        evidenceEmails.set(i.evidence.emailId, {
          subject: i.evidence.subject,
          body: i.evidence.quotedExcerpt,
          sentAt: i.evidence.sentAt,
          sender: i.evidence.senderName,
        });
      }
    }

    const threadId = `thread-${d.id}`;
    let seq = 0;
    for (const [fixtureEmailId, e] of evidenceEmails) {
      const realId = `email-${d.id}-${seq++}`;
      heroEmailIndex.set(fixtureEmailId, realId);
      emails.push({
        id: realId,
        threadId,
        dealId: d.id,
        fromName: e.sender,
        fromAddress: contact.email,
        toAddress: "bharath.vijay@tattava-demo.bank",
        subject: e.subject,
        bodyText: e.body,
        receivedAt: new Date(e.sentAt),
        relevance: "IB_RELEVANT",
        relevanceScore: 0.9,
      });
    }

    // Top up each hero thread with 1-2 generated filler emails for depth.
    const stageLabel = d.workflowStages.find((s) => s.key === d.currentStageKey)?.label ?? "Origination";
    const topUp = randomInt(rng, 2, 3);
    for (let i = 0; i < topUp; i++) {
      const kind = pick(rng, ["update", "request", "milestone"] as const);
      const gen = generateFillerEmail(rng, kind, {
        codename: d.projectCodename,
        clientName: client.name,
        contactName: contact.name,
        contactEmail: contact.email,
        bankerName: "Bharath Vijay",
        bankerEmail: "bharath.vijay@tattava-demo.bank",
        stageLabel,
        valueLabel: d.value ? moneyLabel(d.value.amountMinorUnits) : "TBD",
      });
      emails.push({
        id: `email-${d.id}-fill-${i}`,
        threadId,
        dealId: d.id,
        fromName: contact.name,
        fromAddress: contact.email,
        toAddress: "bharath.vijay@tattava-demo.bank",
        subject: gen.subject,
        bodyText: gen.body,
        receivedAt: new Date(daysAgoIso(d.lastActivityAt, randomInt(rng, 3, 25))),
        relevance: "IB_RELEVANT",
        relevanceScore: 0.85,
      });
    }
  }

  // Filler deals: 4-6 generated emails each.
  const fillerDeals = allDeals.filter((d) => !d.isHero);
  for (const d of fillerDeals) {
    const client = clientFixtures.find((c) => c.id === d.clientId)!;
    const contact = client.contacts[0]!;
    const threadId = `thread-${d.id}`;
    const emailCount = randomInt(rng, 4, 6);
    const kinds: Array<"kickoff" | "update" | "request" | "milestone" | "risk"> = ["kickoff"];
    for (let i = 1; i < emailCount; i++) {
      kinds.push(d.riskStatus === "AT_RISK" && i === emailCount - 1 ? "risk" : pick(rng, ["update", "request", "milestone"] as const));
    }

    kinds.forEach((kind, i) => {
      const gen = generateFillerEmail(rng, kind, {
        codename: d.projectCodename,
        clientName: client.name,
        contactName: contact.name,
        contactEmail: contact.email,
        bankerName: "Bharath Vijay",
        bankerEmail: "bharath.vijay@tattava-demo.bank",
        stageLabel: d.currentStageLabel,
        valueLabel: d.valueMinorUnits ? moneyLabel(d.valueMinorUnits) : "TBD",
      });
      const daysAgo = Math.max(0, Math.round((new Date(d.createdAt).getTime() - new Date(NOW).getTime()) / -86400000) - i * 6);
      emails.push({
        id: `email-${d.id}-${i}`,
        threadId,
        dealId: d.id,
        fromName: i % 2 === 0 ? contact.name : "Bharath Vijay",
        fromAddress: i % 2 === 0 ? contact.email : "bharath.vijay@tattava-demo.bank",
        toAddress: i % 2 === 0 ? "bharath.vijay@tattava-demo.bank" : contact.email,
        subject: gen.subject,
        bodyText: gen.body,
        receivedAt: new Date(daysAgoIso(NOW, Math.max(0, daysAgo))),
        relevance: "IB_RELEVANT",
        relevanceScore: 0.8,
      });
    });
  }

  // Build threads (lastMessageAt = max email receivedAt per thread).
  const threadLastMessage = new Map<string, { dealId: string; date: Date; subject: string; clientId: string }>();
  for (const e of emails) {
    const deal = allDeals.find((d) => d.id === e.dealId)!;
    const existing = threadLastMessage.get(e.threadId);
    if (!existing || e.receivedAt > existing.date) {
      threadLastMessage.set(e.threadId, {
        dealId: e.dealId,
        date: e.receivedAt,
        subject: e.subject,
        clientId: deal.clientId,
      });
    }
  }

  await prisma.emailThread.createMany({
    data: [...threadLastMessage.entries()].map(([threadId, info]) => ({
      id: threadId,
      emailAccountId: "email-account-bharath",
      providerThreadId: threadId,
      subject: info.subject,
      dealId: info.dealId,
      clientId: info.clientId,
      lastMessageAt: info.date,
    })),
  });

  await prisma.email.createMany({
    data: emails.map((e, i) => ({
      id: e.id,
      threadId: e.threadId,
      providerMessageId: `${e.threadId}-msg-${i}`,
      fromAddress: e.fromAddress,
      fromName: e.fromName,
      toAddresses: [e.toAddress],
      ccAddresses: [],
      subject: e.subject,
      bodyText: e.bodyText,
      receivedAt: e.receivedAt,
      relevance: e.relevance,
      relevanceScore: e.relevanceScore,
      processingStatus: "PROCESSED" as const,
      processedAt: e.receivedAt,
    })),
  });

  console.log(`  ${emails.length} emails across ${threadLastMessage.size} threads`);

  return { emails, heroEmailIndex };
}

// ---------------------------------------------------------------------------
// Unprocessed backlog (Phase 3 — Run Scan works through these live)
// ---------------------------------------------------------------------------

async function seedBacklogEmails(allDeals: SeedDeal[], stagesByService: StageMap) {
  const buyerRows = await prisma.dealParticipant.findMany({
    where: { role: "BUYER" },
    include: { company: true },
  });
  const buyerByDeal = new Map<string, string>();
  for (const r of buyerRows) if (!buyerByDeal.has(r.dealId)) buyerByDeal.set(r.dealId, r.company.name);

  const dealRefs: DealRef[] = allDeals.map((d) => ({
    id: d.id,
    projectCodename: d.projectCodename,
    clientId: d.clientId,
    clientName: d.clientName,
    bankingServiceId: d.bankingServiceId,
    currentStageId: d.currentStageId,
    currentStageKey: stagesByService[d.bankingServiceId].find((s) => s.id === d.currentStageId)?.key ?? "",
    buyerCompanyName: buyerByDeal.get(d.id) ?? "the buyer",
  }));

  const halcyonFixture = clientFixtures.find((c) => c.id === "client-halcyon");
  const halcyonContact: ContactRef | undefined = halcyonFixture
    ? { name: halcyonFixture.contacts[0]!.name, email: halcyonFixture.contacts[0]!.email, clientName: halcyonFixture.name }
    : undefined;

  const backlog = buildBacklogEmails(
    rng,
    dealRefs,
    bankers.map((b) => ({ name: b.name, email: b.email })),
    new Date(NOW),
    allDeals.some((d) => d.id === "deal-falcon") ? "deal-falcon" : undefined,
    allDeals.some((d) => d.id === "deal-atlas") ? "deal-atlas" : undefined,
    allDeals.some((d) => d.id === "deal-orion") ? "deal-orion" : undefined,
    halcyonContact,
  );

  const newThreads = new Map<string, { id: string; subject: string; receivedAt: Date }>();
  let newThreadSeq = 0;
  for (const e of backlog) {
    if (!e.threadId && e.newThreadSubject) {
      const existing = newThreads.get(e.newThreadSubject);
      if (!existing || e.receivedAt > existing.receivedAt) {
        newThreads.set(e.newThreadSubject, {
          id: existing?.id ?? `thread-backlog-${newThreadSeq++}`,
          subject: e.newThreadSubject,
          receivedAt: e.receivedAt,
        });
      }
    }
  }

  if (newThreads.size > 0) {
    await prisma.emailThread.createMany({
      data: [...newThreads.values()].map((t) => ({
        id: t.id,
        emailAccountId: "email-account-bharath",
        providerThreadId: t.id,
        subject: t.subject,
        dealId: null,
        clientId: null,
        lastMessageAt: t.receivedAt,
      })),
    });
  }

  await prisma.email.createMany({
    data: backlog.map((e, i) => {
      const threadId = e.threadId ?? newThreads.get(e.newThreadSubject!)!.id;
      return {
        id: `email-backlog-${i}`,
        threadId,
        providerMessageId: `${threadId}-backlog-msg-${i}`,
        fromAddress: e.fromAddress,
        fromName: e.fromName,
        toAddresses: [e.toAddress],
        ccAddresses: [],
        subject: e.subject,
        bodyText: e.bodyText,
        receivedAt: e.receivedAt,
        processingStatus: "PENDING" as const,
      };
    }),
  });

  // Keep existing threads' lastMessageAt honest if a backlog email is the
  // newest message on that thread.
  const latestByExistingThread = new Map<string, Date>();
  for (const e of backlog) {
    if (!e.threadId) continue;
    const current = latestByExistingThread.get(e.threadId);
    if (!current || e.receivedAt > current) latestByExistingThread.set(e.threadId, e.receivedAt);
  }
  for (const [threadId, date] of latestByExistingThread) {
    const thread = await prisma.emailThread.findUnique({ where: { id: threadId }, select: { lastMessageAt: true } });
    if (thread && date > thread.lastMessageAt) {
      await prisma.emailThread.update({ where: { id: threadId }, data: { lastMessageAt: date } });
    }
  }

  console.log(`  ${backlog.length} unprocessed backlog emails (${newThreads.size} new threads)`);
}

// ---------------------------------------------------------------------------
// AI extractions & evidence
// ---------------------------------------------------------------------------

interface ExtractionIndexEntry {
  extractionId: string;
  confidencePercent: number;
}

async function seedAiExtractions(
  allDeals: SeedDeal[],
  emailIndex: { emails: SeedEmail[]; heroEmailIndex: Map<string, string> },
) {
  const extractions: {
    id: string;
    emailId: string;
    dealId: string;
    extractedFields: Record<string, string>;
    confidencePercent: number;
    matchType: "EXISTING_DEAL" | "NEW_DEAL_EXISTING_CLIENT" | "NEW_CLIENT" | "POTENTIAL_OPPORTUNITY" | "UNKNOWN";
    appliedStatus: "AUTO_APPLIED" | "SUGGESTED_PENDING" | "ACCEPTED" | "REJECTED" | "INFO_ONLY";
  }[] = [];
  const evidenceRows: {
    id: string;
    extractionId: string;
    emailId: string;
    quotedExcerpt: string;
    senderName: string;
    sentAt: Date;
  }[] = [];

  let n = 0;
  for (const e of emailIndex.emails) {
    // Extract from ~70% of emails to keep volume high but not literally every email.
    if (rng() > 0.7) continue;
    const deal = allDeals.find((d) => d.id === e.dealId)!;
    const confidencePercent = Math.min(97, randomInt(rng, 62, 97));
    const appliedStatus =
      confidencePercent > 90 ? "AUTO_APPLIED" : confidencePercent >= 70 ? "SUGGESTED_PENDING" : "INFO_ONLY";
    const extractionId = `extraction-${n++}`;

    extractions.push({
      id: extractionId,
      emailId: e.id,
      dealId: deal.id,
      extractedFields: {
        projectCodename: deal.projectCodename,
        clientName: deal.clientName,
        stage: deal.currentStageLabel,
      },
      confidencePercent,
      matchType: "EXISTING_DEAL",
      appliedStatus,
    });
    evidenceRows.push({
      id: `evidence-${extractionId}`,
      extractionId,
      emailId: e.id,
      quotedExcerpt: e.bodyText.slice(0, 280),
      senderName: e.fromName,
      sentAt: e.receivedAt,
    });
  }

  await prisma.aiExtraction.createMany({ data: extractions });
  await prisma.aiExtractionEvidence.createMany({ data: evidenceRows });

  console.log(`  ${extractions.length} AI extractions`);

  const byEmailId = new Map<string, ExtractionIndexEntry>();
  for (const ex of extractions) {
    byEmailId.set(ex.emailId, { extractionId: ex.id, confidencePercent: ex.confidencePercent });
  }
  return byEmailId;
}

// ---------------------------------------------------------------------------
// Deal timeline events
// ---------------------------------------------------------------------------

async function seedDealEvents(
  allDeals: SeedDeal[],
  fillerDealIds: Set<string>,
  emailIndex: { emails: SeedEmail[]; heroEmailIndex: Map<string, string> },
) {
  const rows: {
    id: string;
    dealId: string;
    type: "STAGE_CHANGE" | "VALUE_CHANGE" | "PARTICIPANT_ADDED" | "RISK_FLAGGED" | "MILESTONE" | "NOTE";
    previousValue: string | null;
    newValue: string | null;
    occurredAt: Date;
    sourceEmailId: string | null;
    note: string | null;
  }[] = [];

  let n = 0;
  for (const evt of heroDealEvents) {
    const realEmailId = evt.evidence ? emailIndex.heroEmailIndex.get(evt.evidence.emailId) ?? null : null;
    rows.push({
      id: `deal-event-${n++}`,
      dealId: evt.dealId,
      type: evt.type,
      previousValue: evt.previousValue ?? null,
      newValue: evt.newValue ?? null,
      occurredAt: new Date(evt.occurredAt),
      sourceEmailId: realEmailId,
      note: evt.note,
    });
  }

  for (const d of allDeals.filter((d) => fillerDealIds.has(d.id))) {
    const stages = workflowsByService[d.bankingServiceId];
    const currentIndex = stages.findIndex((s) => s.key === (stages.find((st) => st.label === d.currentStageLabel)?.key ?? ""));
    const created = new Date(d.createdAt);

    rows.push({
      id: `deal-event-${n++}`,
      dealId: d.id,
      type: "MILESTONE",
      previousValue: null,
      newValue: null,
      occurredAt: created,
      sourceEmailId: null,
      note: `${d.projectCodename} opportunity originated.`,
    });

    const eventCount = randomInt(rng, 3, 5);
    for (let i = 0; i < eventCount; i++) {
      const occurredAt = new Date(daysAgoIso(NOW, randomInt(rng, 1, Math.max(2, 160 - i * 10))));
      const kind = pick(rng, ["STAGE_CHANGE", "MILESTONE", "NOTE"] as const);
      if (kind === "STAGE_CHANGE" && currentIndex > 0) {
        const fromStage = stages[Math.max(0, currentIndex - 1)]!;
        rows.push({
          id: `deal-event-${n++}`,
          dealId: d.id,
          type: "STAGE_CHANGE",
          previousValue: fromStage.label,
          newValue: d.currentStageLabel,
          occurredAt,
          sourceEmailId: null,
          note: `${d.projectCodename} advanced from ${fromStage.label} to ${d.currentStageLabel}.`,
        });
      } else {
        rows.push({
          id: `deal-event-${n++}`,
          dealId: d.id,
          type: kind,
          previousValue: null,
          newValue: null,
          occurredAt,
          sourceEmailId: null,
          note: pick(rng, MILESTONE_NOTE_TEMPLATES)(d.projectCodename),
        });
      }
    }

    if (d.riskStatus === "AT_RISK") {
      rows.push({
        id: `deal-event-${n++}`,
        dealId: d.id,
        type: "RISK_FLAGGED",
        previousValue: null,
        newValue: null,
        occurredAt: new Date(daysAgoIso(NOW, randomInt(rng, 1, 5))),
        sourceEmailId: null,
        note: d.riskNote ?? "Extended period without counterparty response.",
      });
    }
  }

  await prisma.dealEvent.createMany({ data: rows });
  console.log(`  ${rows.length} deal timeline events`);
}

// ---------------------------------------------------------------------------
// Intelligence feed
// ---------------------------------------------------------------------------

async function seedIntelligenceEvents(
  allDeals: SeedDeal[],
  fillerDealIds: Set<string>,
  emailIndex: { emails: SeedEmail[]; heroEmailIndex: Map<string, string> },
) {
  const rows: {
    id: string;
    organizationId: string;
    category: "DEAL_CHANGE" | "CLIENT_ACTIVITY" | "TASK" | "OPPORTUNITY" | "RISK" | "IMPORTANT_EMAIL";
    dealId: string | null;
    clientId: string | null;
    headline: string;
    detail: string | null;
    deltaFrom: string | null;
    deltaTo: string | null;
    confidencePercent: number | null;
    sourceEmailId: string | null;
    reviewStatus: "NEW" | "REVIEWED" | "DISMISSED";
    occurredAt: Date;
  }[] = [];

  let n = 0;
  for (const item of heroIntelligence) {
    const realEmailId = item.evidence ? emailIndex.heroEmailIndex.get(item.evidence.emailId) ?? null : null;
    rows.push({
      id: `intel-${n++}`,
      organizationId: ORG_ID,
      category: item.category,
      dealId: item.dealId ?? null,
      clientId: item.clientId ?? null,
      headline: item.headline,
      detail: item.detail ?? null,
      deltaFrom: item.delta?.from ?? null,
      deltaTo: item.delta?.to ?? null,
      confidencePercent: item.confidencePercent ?? null,
      sourceEmailId: realEmailId,
      reviewStatus: "NEW",
      occurredAt: new Date(item.occurredAt),
    });
  }

  for (const d of allDeals.filter((d) => fillerDealIds.has(d.id))) {
    const count = randomInt(rng, 2, 3);
    for (let i = 0; i < count; i++) {
      const kind = pick(rng, ["DEAL_CHANGE", "CLIENT_ACTIVITY", "OPPORTUNITY"] as const);
      const occurredAt = new Date(daysAgoIso(NOW, randomInt(rng, 0, 20)));
      if (kind === "DEAL_CHANGE") {
        rows.push({
          id: `intel-${n++}`,
          organizationId: ORG_ID,
          category: "DEAL_CHANGE",
          dealId: d.id,
          clientId: d.clientId,
          headline: `${d.projectCodename} — advanced to ${d.currentStageLabel}`,
          detail: null,
          deltaFrom: null,
          deltaTo: d.currentStageLabel,
          confidencePercent: randomInt(rng, 75, 96),
          sourceEmailId: null,
          reviewStatus: pick(rng, ["NEW", "NEW", "REVIEWED"] as const),
          occurredAt,
        });
      } else if (kind === "CLIENT_ACTIVITY") {
        rows.push({
          id: `intel-${n++}`,
          organizationId: ORG_ID,
          category: "CLIENT_ACTIVITY",
          dealId: d.id,
          clientId: d.clientId,
          headline: `${d.clientName} — active correspondence on ${d.projectCodename}`,
          detail: "Multiple exchanges detected over the past week.",
          deltaFrom: null,
          deltaTo: null,
          confidencePercent: randomInt(rng, 70, 90),
          sourceEmailId: null,
          reviewStatus: "NEW",
          occurredAt,
        });
      } else {
        rows.push({
          id: `intel-${n++}`,
          organizationId: ORG_ID,
          category: "OPPORTUNITY",
          dealId: null,
          clientId: d.clientId,
          headline: `${d.clientName} — potential follow-on opportunity`,
          detail: "Signal detected in recent correspondence; not yet a mandate.",
          deltaFrom: null,
          deltaTo: null,
          confidencePercent: randomInt(rng, 60, 82),
          sourceEmailId: null,
          reviewStatus: "NEW",
          occurredAt,
        });
      }
    }
    if (d.riskStatus === "AT_RISK") {
      rows.push({
        id: `intel-${n++}`,
        organizationId: ORG_ID,
        category: "RISK",
        dealId: d.id,
        clientId: d.clientId,
        headline: `${d.projectCodename} — requires follow-up`,
        detail: d.riskNote,
        deltaFrom: null,
        deltaTo: null,
        confidencePercent: null,
        sourceEmailId: null,
        reviewStatus: "NEW",
        occurredAt: new Date(daysAgoIso(NOW, randomInt(rng, 0, 3))),
      });
    }
  }

  await prisma.intelligenceEvent.createMany({ data: rows });
  console.log(`  ${rows.length} intelligence events`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

async function seedTasks(allDeals: SeedDeal[], fillerDealIds: Set<string>) {
  const rows: {
    id: string;
    organizationId: string;
    dealId: string | null;
    clientId: string | null;
    title: string;
    description: string | null;
    ownerId: string | null;
    priority: DealPriority;
    dueDate: Date | null;
    status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";
    aiConfidencePercent: number | null;
    createdAt: Date;
  }[] = [];

  let n = 0;
  for (const t of heroTasks) {
    rows.push({
      id: `task-${n++}`,
      organizationId: ORG_ID,
      dealId: t.dealId ?? null,
      clientId: t.clientId ?? null,
      title: t.title,
      description: t.description,
      ownerId: t.ownerId,
      priority: t.priority,
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      status: t.status,
      aiConfidencePercent: t.aiConfidencePercent ?? null,
      createdAt: new Date(t.createdAt),
    });
  }

  const statusPool: Array<"TODO" | "IN_PROGRESS" | "COMPLETED"> = ["TODO", "TODO", "IN_PROGRESS", "COMPLETED"];
  for (const d of allDeals.filter((d) => fillerDealIds.has(d.id))) {
    const count = randomInt(rng, 2, 3);
    for (let i = 0; i < count; i++) {
      rows.push({
        id: `task-${n++}`,
        organizationId: ORG_ID,
        dealId: d.id,
        clientId: d.clientId,
        title: `${pick(rng, FILLER_TASK_TITLES)} — ${d.projectCodename}`,
        description: `Follow-up item generated from recent activity on ${d.projectCodename}.`,
        ownerId: d.leadBankerId,
        priority: d.priority,
        dueDate: new Date(daysFromIso(NOW, randomInt(rng, -2, 10))),
        status: pick(rng, statusPool),
        aiConfidencePercent: rng() > 0.5 ? randomInt(rng, 70, 95) : null,
        createdAt: new Date(daysAgoIso(NOW, randomInt(rng, 0, 20))),
      });
    }
  }

  await prisma.task.createMany({ data: rows });
  console.log(`  ${rows.length} tasks`);
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

async function seedOpportunities() {
  await prisma.opportunity.createMany({
    data: heroOpportunities.map((o) => ({
      id: o.id,
      organizationId: ORG_ID,
      clientId: o.clientId,
      potentialServiceId: o.potentialServiceId,
      signalText: o.signalText,
      confidencePercent: o.confidencePercent,
      recommendedAction: o.recommendedAction,
      status: o.status,
      createdAt: new Date(o.createdAt),
    })),
  });
  console.log(`  ${heroOpportunities.length} opportunities`);
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

async function seedMeetings(allDeals: SeedDeal[]) {
  const withMilestone = allDeals.filter((d) => d.nextMilestoneDate);
  const rows = withMilestone.map((d, i) => ({
    id: `meeting-${i}`,
    dealId: d.id,
    title: d.nextMilestone ?? `${d.projectCodename} check-in`,
    startsAt: d.nextMilestoneDate!,
    endsAt: new Date(new Date(d.nextMilestoneDate!).getTime() + 60 * 60 * 1000),
    attendees: [d.clientName, "Bharath Vijay"],
  }));
  await prisma.meeting.createMany({ data: rows });
  console.log(`  ${rows.length} meetings`);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function seedNotifications() {
  const rows = [
    { title: "Project Falcon changed stage", body: "Buyer Outreach → Management Meetings", linkHref: "/deals/deal-falcon" },
    { title: "3 tasks are due today", body: "Check your Action Required list on the dashboard.", linkHref: "/tasks" },
    { title: "New opportunity detected", body: "Acme Industries — potential acquisition signal.", linkHref: "/clients/client-acme" },
    { title: "Project Orion requires attention", body: "No client activity for 9 days.", linkHref: "/deals/deal-orion" },
    { title: "Project Everest bookbuild update", body: "Order book covered 2.1x on day one.", linkHref: "/deals/deal-everest" },
    { title: "Project Phoenix — lender consent at risk", body: "Two of five lenders have not responded.", linkHref: "/deals/deal-phoenix" },
  ];
  await prisma.notification.createMany({
    data: rows.map((r, i) => ({
      id: `notification-${i}`,
      userId: "banker-bharath",
      type: "intelligence",
      title: r.title,
      body: r.body,
      linkHref: r.linkHref,
      readAt: i < 2 ? new Date(daysAgoIso(NOW, 1)) : null,
      createdAt: new Date(daysAgoIso(NOW, i)),
    })),
  });
  console.log(`  ${rows.length} notifications`);
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

async function seedAuditLog(fillerDealIds: Set<string>) {
  const heroRows = heroAuditLog.map((e) => ({
    id: e.id,
    organizationId: ORG_ID,
    actorUserId: e.actorName === "Tattava AI" ? null : bankers.find((b) => b.name === e.actorName)?.id ?? null,
    action: e.action,
    entityType: "Deal",
    entityId: e.entityLabel,
    metadata: e.metadata ? { detail: e.metadata } : undefined,
    createdAt: new Date(e.occurredAt),
  }));

  const fillerRows = [...fillerDealIds].slice(0, 10).map((dealId, i) => ({
    id: `audit-filler-${i}`,
    organizationId: ORG_ID,
    actorUserId: "banker-bharath",
    action: "Deal created",
    entityType: "Deal",
    entityId: dealId,
    metadata: undefined,
    createdAt: new Date(daysAgoIso(NOW, randomInt(rng, 20, 150))),
  }));

  await prisma.auditLog.createMany({ data: [...heroRows, ...fillerRows] });
  console.log(`  ${heroRows.length + fillerRows.length} audit log entries`);
}

// ---------------------------------------------------------------------------

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
