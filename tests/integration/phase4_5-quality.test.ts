import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { createIntelligenceEvent } from "@/lib/pipeline/intelligence-events";

// PHASE4_5_PRODUCTION_HARDENING.md — data quality + security coverage
// (spec §57-58, §67). Self-contained fixtures, including a second
// organization, never depending on prisma/seed.ts's mutable global state —
// same pattern as tests/integration/deal-intelligence.test.ts.

const prisma = getPrismaClient();

const TEST_IDS = {
  client: "test-p45-client",
  company: "test-p45-company",
  workflow: "test-p45-workflow",
  stage: "test-p45-stage",
  deal: "test-p45-deal",
  otherOrg: "test-p45-org-2",
  otherOrgUser: "test-p45-org-2-user",
  otherClient: "test-p45-org-2-client",
  otherCompany: "test-p45-org-2-company",
  otherWorkflow: "test-p45-org-2-workflow",
  otherStage: "test-p45-org-2-stage",
  otherDeal: "test-p45-org-2-deal",
  otherTask: "test-p45-org-2-task",
  repeatedEmail: "test-p45-repeated-source",
  repeatedThread: "test-p45-repeated-thread",
  repeatedEmailAccount: "test-p45-repeated-email-account",
};

async function cleanup() {
  await prisma.task.deleteMany({ where: { id: TEST_IDS.otherTask } });
  await prisma.intelligenceEvent.deleteMany({ where: { dealId: { in: [TEST_IDS.deal, TEST_IDS.otherDeal] } } });
  // Cascades EmailThread -> Email for the duplication-multiplicity fixture.
  await prisma.emailAccount.deleteMany({ where: { id: TEST_IDS.repeatedEmailAccount } });
  await prisma.deal.deleteMany({ where: { id: { in: [TEST_IDS.deal, TEST_IDS.otherDeal] } } });
  await prisma.dealStageDefinition.deleteMany({ where: { id: { in: [TEST_IDS.stage, TEST_IDS.otherStage] } } });
  await prisma.dealWorkflow.deleteMany({ where: { id: { in: [TEST_IDS.workflow, TEST_IDS.otherWorkflow] } } });
  await prisma.client.deleteMany({ where: { id: { in: [TEST_IDS.client, TEST_IDS.otherClient] } } });
  await prisma.company.deleteMany({ where: { id: { in: [TEST_IDS.company, TEST_IDS.otherCompany] } } });
  await prisma.organizationMember.deleteMany({ where: { userId: TEST_IDS.otherOrgUser } });
  await prisma.user.deleteMany({ where: { id: TEST_IDS.otherOrgUser } });
  await prisma.organization.deleteMany({ where: { id: TEST_IDS.otherOrg } });
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
      priority: "MEDIUM",
    },
  });
}

describe("Data quality — duplication at higher multiplicity (spec §67)", () => {
  afterAll(cleanup);

  it("processing the same source signal 5 times never creates more than one event", async () => {
    await cleanup();
    await makeDeal(DEMO_ORG_ID, TEST_IDS, "Project Test45 Falcon");

    // sourceEmailId carries a real FK to Email, so even the first call (the
    // only one that actually reaches db.intelligenceEvent.create()) needs a
    // genuine row — same fixture shape as
    // tests/integration/deal-intelligence.test.ts's Test 9.
    await prisma.emailAccount.create({
      data: { id: TEST_IDS.repeatedEmailAccount, organizationId: DEMO_ORG_ID, userId: "banker-bharath", provider: "GMAIL", emailAddress: "repeated-fixture@tattava-demo.bank" },
    });
    await prisma.emailThread.create({
      data: { id: TEST_IDS.repeatedThread, emailAccountId: TEST_IDS.repeatedEmailAccount, providerThreadId: TEST_IDS.repeatedThread, subject: "Repeated-processing fixture", dealId: TEST_IDS.deal, lastMessageAt: DEMO_NOW },
    });
    await prisma.email.create({
      data: {
        id: TEST_IDS.repeatedEmail,
        threadId: TEST_IDS.repeatedThread,
        providerMessageId: TEST_IDS.repeatedEmail,
        fromAddress: "buyer@example.com",
        toAddresses: ["repeated-fixture@tattava-demo.bank"],
        ccAddresses: [],
        subject: "Repeated-processing fixture",
        bodyText: "Stage change notice, reprocessed multiple times.",
        receivedAt: DEMO_NOW,
      },
    });

    const params = {
      organizationId: DEMO_ORG_ID,
      eventType: "STAGE_CHANGED" as const,
      dealId: TEST_IDS.deal,
      headline: "Deal stage changed",
      deltaFrom: "Indicative Bids",
      deltaTo: "Management Meetings",
      confidencePercent: 96,
      occurredAt: DEMO_NOW,
      sourceEmailId: TEST_IDS.repeatedEmail,
    };

    const first = await createIntelligenceEvent(prisma, params);
    for (let i = 0; i < 4; i++) {
      const repeat = await createIntelligenceEvent(prisma, params);
      expect(repeat.id).toBe(first.id);
    }

    const count = await prisma.intelligenceEvent.count({
      where: { sourceEmailId: params.sourceEmailId, eventType: "STAGE_CHANGED" },
    });
    expect(count).toBe(1);
  });
});

describe("Security — organization-scoped entity lookups (spec §57-58)", () => {
  afterAll(cleanup);

  it("a task belonging to a different organization is not found under DEMO_ORG_ID's scope", async () => {
    await cleanup();
    await prisma.organization.create({ data: { id: TEST_IDS.otherOrg, name: "Other Org 4.5", slug: "test-p45-other-org" } });
    await prisma.user.create({ data: { id: TEST_IDS.otherOrgUser, email: "other-org-45@tattava-demo.bank", authProvider: "GOOGLE" } });
    await prisma.organizationMember.create({ data: { organizationId: TEST_IDS.otherOrg, userId: TEST_IDS.otherOrgUser, role: "BANKER" } });
    await makeDeal(
      TEST_IDS.otherOrg,
      { client: TEST_IDS.otherClient, company: TEST_IDS.otherCompany, workflow: TEST_IDS.otherWorkflow, stage: TEST_IDS.otherStage, deal: TEST_IDS.otherDeal },
      "Project Other45",
    );
    await prisma.task.create({
      data: { id: TEST_IDS.otherTask, organizationId: TEST_IDS.otherOrg, dealId: TEST_IDS.otherDeal, title: "Other org task", status: "TODO" },
    });

    // The exact guard pattern src/lib/actions/mutations.ts#updateTaskStatus
    // now uses — this verifies the mechanism itself, not the Server Action
    // wrapper (which needs an authenticated request context to invoke).
    const foundUnderWrongOrg = await prisma.task.findFirst({ where: { id: TEST_IDS.otherTask, organizationId: DEMO_ORG_ID } });
    expect(foundUnderWrongOrg).toBeNull();

    const foundUnderOwnOrg = await prisma.task.findFirst({ where: { id: TEST_IDS.otherTask, organizationId: TEST_IDS.otherOrg } });
    expect(foundUnderOwnOrg).not.toBeNull();
  });

  it("a deal belonging to a different organization is not found under DEMO_ORG_ID's scope (deal detail page guard)", async () => {
    const belongsToOwnOrg = await prisma.deal.count({ where: { id: TEST_IDS.otherDeal, organizationId: TEST_IDS.otherOrg } });
    const belongsToDemoOrg = await prisma.deal.count({ where: { id: TEST_IDS.otherDeal, organizationId: DEMO_ORG_ID } });
    expect(belongsToOwnOrg).toBe(1);
    expect(belongsToDemoOrg).toBe(0);
  });
});
