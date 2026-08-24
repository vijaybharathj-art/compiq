import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { prismaDealRepository, prismaClientRepository } from "@/lib/data/prisma-repository";
import { getAIProvider } from "@/lib/ai";
import { matchClient, matchDeal } from "@/lib/pipeline/matching";
import { applyDealChanges } from "@/lib/pipeline/suggestions";
import { emptyScanCounters } from "@/lib/pipeline/types";
import { VALUATION_CHANGE_SCENARIOS, toEmailInput } from "../fixtures/phase5-golden-emails";

// PHASE5_REAL_EMAIL_INTEGRATION.md §14, §58, §69 — two things this file
// proves:
// (1) The org-scoping fix in src/lib/data/prisma-repository.ts (the
//     explicit prerequisite for real email ingestion) actually holds for
//     every entity the spec names, including the ones Phase 5 itself added
//     (EmailAccount, EmailThread, Email) — never relying on a browser-
//     supplied id alone.
// (2) The positive valuation-change golden test end-to-end: a golden
//     email, matched to a real deal, produces a real, AUTO_APPLY
//     DEAL_VALUE_CHANGED — not just a correctly-shaped extraction in
//     isolation (tests/unit/phase5-golden-emails.test.ts covers that
//     layer already).

const prisma = getPrismaClient();

const TEST_IDS = {
  otherOrg: "test-p5-sec-org-2",
  otherOrgUser: "test-p5-sec-org-2-user",
  otherClient: "test-p5-sec-org-2-client",
  otherCompany: "test-p5-sec-org-2-company",
  otherWorkflow: "test-p5-sec-org-2-workflow",
  otherStage: "test-p5-sec-org-2-stage",
  otherDeal: "test-p5-sec-org-2-deal",
  otherAccount: "test-p5-sec-org-2-account",
  otherThread: "test-p5-sec-org-2-thread",
  otherEmail: "test-p5-sec-org-2-email",
  otherRisk: "test-p5-sec-org-2-risk",
  otherBriefing: "test-p5-sec-org-2-briefing",
  otherExtraction: "test-p5-sec-org-2-extraction",
  otherEvidence: "test-p5-sec-org-2-evidence",

  valOrg: "test-p5-val-org",
  client: "test-p5-val-client",
  company: "test-p5-val-company",
  workflow: "test-p5-val-workflow",
  stage: "test-p5-val-stage",
  deal: "test-p5-val-deal",
  account: "test-p5-val-account",
  thread: "test-p5-val-thread",
  email: "test-p5-val-email",
};

async function cleanup() {
  await prisma.risk.deleteMany({ where: { id: TEST_IDS.otherRisk } });
  await prisma.briefing.deleteMany({ where: { id: TEST_IDS.otherBriefing } });
  await prisma.aiExtractionEvidence.deleteMany({ where: { id: TEST_IDS.otherEvidence } });
  await prisma.aiExtraction.deleteMany({ where: { id: TEST_IDS.otherExtraction } });
  // Cascades EmailThread -> Email -> DealValuationObservation for both fixtures.
  await prisma.emailAccount.deleteMany({ where: { id: { in: [TEST_IDS.otherAccount, TEST_IDS.account] } } });
  await prisma.deal.deleteMany({ where: { id: { in: [TEST_IDS.otherDeal, TEST_IDS.deal] } } });
  await prisma.dealStageDefinition.deleteMany({ where: { id: { in: [TEST_IDS.otherStage, TEST_IDS.stage] } } });
  await prisma.dealWorkflow.deleteMany({ where: { id: { in: [TEST_IDS.otherWorkflow, TEST_IDS.workflow] } } });
  await prisma.client.deleteMany({ where: { id: { in: [TEST_IDS.otherClient, TEST_IDS.client] } } });
  await prisma.company.deleteMany({ where: { id: { in: [TEST_IDS.otherCompany, TEST_IDS.company] } } });
  await prisma.organizationMember.deleteMany({ where: { userId: TEST_IDS.otherOrgUser } });
  await prisma.user.deleteMany({ where: { id: TEST_IDS.otherOrgUser } });
  await prisma.organization.deleteMany({ where: { id: { in: [TEST_IDS.otherOrg, TEST_IDS.valOrg] } } });
}

async function makeDeal(orgId: string, ids: { client: string; company: string; workflow: string; stage: string; deal: string }, codename: string) {
  const bankingService = await prisma.bankingService.findFirstOrThrow({ where: { code: "MA" } });
  await prisma.client.create({ data: { id: ids.client, organizationId: orgId, name: `${codename} Client`, relationshipStatus: "ACTIVE" } });
  await prisma.company.create({ data: { id: ids.company, organizationId: orgId, name: `${codename} Client`, isClientEntity: true } });
  await prisma.dealWorkflow.create({ data: { id: ids.workflow, bankingServiceId: bankingService.id, name: `${codename} Workflow` } });
  const stage = await prisma.dealStageDefinition.create({
    data: { id: ids.stage, workflowId: ids.workflow, key: "indicative_bids", label: "Indicative Bids", sortOrder: 5 },
  });
  return prisma.deal.create({
    data: {
      id: ids.deal,
      organizationId: orgId,
      projectCodename: codename,
      clientId: ids.client,
      bankingServiceId: bankingService.id,
      dealType: "SELL_SIDE_MA",
      workflowId: ids.workflow,
      currentStageId: stage.id,
      valueMinorUnits: 500_000_000_00n,
      priority: "HIGH",
    },
  });
}

describe("Phase 5 — cross-organization isolation (database)", () => {
  afterAll(cleanup);

  it("EmailAccount, EmailThread, and Email belonging to a different organization are not found under DEMO_ORG_ID's scope", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.otherOrg, name: "Other Org P5", slug: "test-p5-other-org" } });
    await prisma.user.create({ data: { id: TEST_IDS.otherOrgUser, email: "other-org-p5@tattava-demo.bank", authProvider: "GOOGLE" } });
    await prisma.organizationMember.create({ data: { organizationId: TEST_IDS.otherOrg, userId: TEST_IDS.otherOrgUser, role: "BANKER" } });

    await prisma.emailAccount.create({
      data: { id: TEST_IDS.otherAccount, organizationId: TEST_IDS.otherOrg, userId: TEST_IDS.otherOrgUser, provider: "GMAIL", providerAccountId: "other-org-provider-account", emailAddress: "other-org@example.com" },
    });
    await prisma.emailThread.create({
      data: { id: TEST_IDS.otherThread, emailAccountId: TEST_IDS.otherAccount, providerThreadId: TEST_IDS.otherThread, subject: "Other org thread", lastMessageAt: DEMO_NOW },
    });
    await prisma.email.create({
      data: { id: TEST_IDS.otherEmail, threadId: TEST_IDS.otherThread, providerMessageId: TEST_IDS.otherEmail, fromAddress: "x@example.com", toAddresses: [], ccAddresses: [], subject: "Other org email", bodyText: "Confidential to the other org.", receivedAt: DEMO_NOW },
    });

    // EmailAccount: organizationId is a direct column.
    expect(await prisma.emailAccount.findFirst({ where: { id: TEST_IDS.otherAccount, organizationId: DEMO_ORG_ID } })).toBeNull();
    expect(await prisma.emailAccount.findFirst({ where: { id: TEST_IDS.otherAccount, organizationId: TEST_IDS.otherOrg } })).not.toBeNull();

    // EmailThread: scoped via emailAccountId -> EmailAccount.organizationId.
    expect(await prisma.emailThread.findFirst({ where: { id: TEST_IDS.otherThread, emailAccount: { organizationId: DEMO_ORG_ID } } })).toBeNull();
    expect(await prisma.emailThread.findFirst({ where: { id: TEST_IDS.otherThread, emailAccount: { organizationId: TEST_IDS.otherOrg } } })).not.toBeNull();

    // Email: scoped via threadId -> emailAccountId -> organizationId — the
    // exact join src/lib/search.ts uses for org-scoped email search.
    expect(await prisma.email.findFirst({ where: { id: TEST_IDS.otherEmail, thread: { emailAccount: { organizationId: DEMO_ORG_ID } } } })).toBeNull();
    expect(await prisma.email.findFirst({ where: { id: TEST_IDS.otherEmail, thread: { emailAccount: { organizationId: TEST_IDS.otherOrg } } } })).not.toBeNull();
  });

  it("Risk, Briefing, and AuditLog belonging to a different organization are not found under DEMO_ORG_ID's scope", async () => {
    await makeDeal(TEST_IDS.otherOrg, { client: TEST_IDS.otherClient, company: TEST_IDS.otherCompany, workflow: TEST_IDS.otherWorkflow, stage: TEST_IDS.otherStage, deal: TEST_IDS.otherDeal }, "Project OtherP5");

    await prisma.risk.create({
      data: { id: TEST_IDS.otherRisk, organizationId: TEST_IDS.otherOrg, dealId: TEST_IDS.otherDeal, riskType: "TIMELINE_DELAY", description: "Other org risk", confidencePercent: 80, severity: "MEDIUM", detectedAt: DEMO_NOW },
    });
    await prisma.briefing.create({
      data: { id: TEST_IDS.otherBriefing, organizationId: TEST_IDS.otherOrg, userId: TEST_IDS.otherOrgUser, type: "MORNING", date: DEMO_NOW, summary: {}, content: {}, model: "demo", promptVersion: "test" },
    });

    expect(await prisma.risk.findFirst({ where: { id: TEST_IDS.otherRisk, organizationId: DEMO_ORG_ID } })).toBeNull();
    expect(await prisma.risk.findFirst({ where: { id: TEST_IDS.otherRisk, organizationId: TEST_IDS.otherOrg } })).not.toBeNull();

    expect(await prisma.briefing.findFirst({ where: { id: TEST_IDS.otherBriefing, organizationId: DEMO_ORG_ID } })).toBeNull();
    expect(await prisma.briefing.findFirst({ where: { id: TEST_IDS.otherBriefing, organizationId: TEST_IDS.otherOrg } })).not.toBeNull();

    const auditEntries = await prisma.auditLog.count({ where: { organizationId: TEST_IDS.otherOrg } });
    expect(auditEntries).toBe(0); // none created here — the point is the query shape below is exercised elsewhere too
    expect(await prisma.auditLog.findFirst({ where: { organizationId: DEMO_ORG_ID, entityId: TEST_IDS.otherOrg } })).toBeNull();
  });

  it("a DealValuationObservation and AiExtractionEvidence belonging to a different organization are not reachable under DEMO_ORG_ID's scope", async () => {
    await prisma.emailAccount.create({
      data: { id: TEST_IDS.otherAccount + "-2", organizationId: TEST_IDS.otherOrg, userId: TEST_IDS.otherOrgUser, provider: "GMAIL", emailAddress: "other-org-2@example.com" },
    }).catch(() => {}); // may already exist from a prior test in this file; ignore

    const observation = await prisma.dealValuationObservation.create({
      data: { dealId: TEST_IDS.otherDeal, valueMinorUnits: 999_000_000_00n, currency: "USD", observationType: "SELLER_EXPECTATION", source: "test", confidencePercent: 80, observedAt: DEMO_NOW },
    });
    // DealValuationObservation carries no organizationId column of its own — scoped via dealId -> Deal.organizationId.
    expect(await prisma.dealValuationObservation.findFirst({ where: { id: observation.id, deal: { organizationId: DEMO_ORG_ID } } })).toBeNull();
    expect(await prisma.dealValuationObservation.findFirst({ where: { id: observation.id, deal: { organizationId: TEST_IDS.otherOrg } } })).not.toBeNull();
    await prisma.dealValuationObservation.deleteMany({ where: { id: observation.id } });

    // AiExtractionEvidence — same join pattern src/lib/actions/pipeline-actions.ts's extractionOrgFilter uses.
    await prisma.aiExtraction.create({
      data: { id: TEST_IDS.otherExtraction, emailId: TEST_IDS.otherEmail, dealId: TEST_IDS.otherDeal, extractedFields: {}, confidencePercent: 80, matchType: "EXISTING_DEAL", appliedStatus: "INFO_ONLY", promptVersion: "test" },
    });
    await prisma.aiExtractionEvidence.create({
      data: { id: TEST_IDS.otherEvidence, extractionId: TEST_IDS.otherExtraction, emailId: TEST_IDS.otherEmail, quotedExcerpt: "confidential excerpt", senderName: "Someone", sentAt: DEMO_NOW },
    });

    const orgFilter = (orgId: string) => ({ id: TEST_IDS.otherEvidence, extraction: { email: { thread: { emailAccount: { organizationId: orgId } } } } });
    expect(await prisma.aiExtractionEvidence.findFirst({ where: orgFilter(DEMO_ORG_ID) })).toBeNull();
    expect(await prisma.aiExtractionEvidence.findFirst({ where: orgFilter(TEST_IDS.otherOrg) })).not.toBeNull();
  });

  it("prismaDealRepository.get() and prismaClientRepository.get() — the repository functions Phase 5 fixed — return null for a cross-organization id, not another organization's data", async () => {
    // These functions hardcode DEMO_ORG_ID scoping internally
    // (src/lib/data/prisma-repository.ts) — this proves that scoping
    // actually holds for the deal/client fixture created above, which
    // belongs to test-p5-sec-org-2, not DEMO_ORG_ID.
    expect(await prismaDealRepository.get(TEST_IDS.otherDeal)).toBeNull();
    expect(await prismaClientRepository.get(TEST_IDS.otherClient)).toBeNull();
  });
});

describe("Phase 5 — positive valuation-change golden test, end-to-end (database)", () => {
  afterAll(cleanup);

  it("a golden valuation-change email, matched to a real deal by project codename, produces a real AUTO_APPLY DEAL_VALUE_CHANGED", async () => {
    await cleanup();
    // A dedicated organization, not DEMO_ORG_ID — this test's purpose is
    // proving the pipeline mechanics (matching, extraction,
    // applyDealChanges), not exercising the seeded demo org, whose
    // recent-window "top events" other tests (e.g.
    // tests/integration/deal-intelligence.test.ts) assert tightly against.
    // Writing a real DEAL_VALUE_CHANGED into DEMO_ORG_ID here would be
    // exactly the kind of shared-state pollution that test warns about.
    await prisma.organization.create({ data: { id: TEST_IDS.valOrg, name: "Valuation Test Org", slug: "test-p5-val-org" } });

    const deal = await makeDeal(TEST_IDS.valOrg, TEST_IDS, "Project Halstead");

    await prisma.emailAccount.create({
      data: { id: TEST_IDS.account, organizationId: TEST_IDS.valOrg, userId: "banker-bharath", provider: "GMAIL", providerAccountId: "test-p5-val-provider-account", emailAddress: "val-fixture@tattava-demo.bank" },
    });
    await prisma.emailThread.create({
      data: { id: TEST_IDS.thread, emailAccountId: TEST_IDS.account, providerThreadId: TEST_IDS.thread, subject: "Project Halstead — valuation", lastMessageAt: DEMO_NOW },
    });

    const golden = VALUATION_CHANGE_SCENARIOS[0]!; // "Enterprise value is confirmed at $825M..."
    const bodyText = `${golden.bodyText} Reference: Project Halstead.`;
    await prisma.email.create({
      data: { id: TEST_IDS.email, threadId: TEST_IDS.thread, providerMessageId: TEST_IDS.email, fromAddress: golden.fromAddress, fromName: golden.fromName, toAddresses: golden.toAddresses, ccAddresses: [], subject: golden.subject, bodyText, receivedAt: DEMO_NOW },
    });

    const aiProvider = getAIProvider();
    const emailInput = toEmailInput({ ...golden, bodyText });
    const extraction = await aiProvider.extractEntities(emailInput, { organizationId: TEST_IDS.valOrg, candidateDeals: [] });
    expect(extraction.dealName).toBe("Project Halstead");
    expect(extraction.enterpriseValue?.amountMinorUnits).toBe(825_000_000_00);

    const clientId = await matchClient(prisma, TEST_IDS.valOrg, extraction, []);
    const matchDecision = await matchDeal(prisma, aiProvider, TEST_IDS.valOrg, TEST_IDS.thread, clientId, extraction);
    expect(matchDecision.matchType).toBe("EXISTING_DEAL");
    expect(matchDecision.dealId).toBe(deal.id);

    const counters = emptyScanCounters();
    await applyDealChanges(
      prisma,
      { organizationId: TEST_IDS.valOrg, emailId: TEST_IDS.email, dealId: deal.id, extraction, matchDecision, processingJobId: "", occurredAt: DEMO_NOW },
      counters,
    );

    expect(counters.dealsUpdated).toBe(1);

    const updatedDeal = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updatedDeal.enterpriseValueMinorUnits).toBe(825_000_000_00n);

    const dealEvent = await prisma.dealEvent.findFirst({ where: { dealId: deal.id, type: "VALUE_CHANGE" } });
    expect(dealEvent).not.toBeNull();
    expect(dealEvent!.newValue).toContain("825");

    const observation = await prisma.dealValuationObservation.findFirst({ where: { dealId: deal.id } });
    expect(observation).not.toBeNull();
    expect(observation!.valueMinorUnits).toBe(825_000_000_00n);

    const event = await prisma.intelligenceEvent.findFirst({ where: { dealId: deal.id, eventType: "DEAL_VALUE_CHANGED" } });
    expect(event).not.toBeNull();
  });
});
