import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { createIntelligenceEvent } from "@/lib/pipeline/intelligence-events";
import { getWhatChangedSince, getIntelligenceFeed } from "@/lib/intelligence/feed";
import { generateMorningBriefing } from "@/lib/intelligence/briefing";

// Integration coverage for PHASE4_DEAL_INTELLIGENCE.md §72 Tests 1, 9, 10,
// plus organization isolation (§69). Self-contained fixtures — a second
// organization included — rather than depending on prisma/seed.ts's state.

const prisma = getPrismaClient();

const TEST_IDS = {
  client: "test-p4-client",
  company: "test-p4-company",
  workflow: "test-p4-workflow",
  stage: "test-p4-stage",
  deal: "test-p4-deal",
  banker: "banker-bharath",
  otherOrg: "test-p4-org-2",
  otherOrgUser: "test-p4-org-2-user",
  otherClient: "test-p4-org-2-client",
  otherCompany: "test-p4-org-2-company",
  otherWorkflow: "test-p4-org-2-workflow",
  otherStage: "test-p4-org-2-stage",
  otherDeal: "test-p4-org-2-deal",
  dedupeEmail: "test-p4-dedup-email",
  dedupeThread: "test-p4-dedup-thread",
  dedupeEmailAccount: "test-p4-dedup-email-account",
};

async function cleanup() {
  await prisma.intelligenceEvent.deleteMany({ where: { dealId: { in: [TEST_IDS.deal, TEST_IDS.otherDeal] } } });
  await prisma.briefing.deleteMany({ where: { organizationId: { in: [DEMO_ORG_ID, TEST_IDS.otherOrg] } } });
  // Cascades EmailThread -> Email for the Test 9 dedupe fixture.
  await prisma.emailAccount.deleteMany({ where: { id: TEST_IDS.dedupeEmailAccount } });
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
      valueMinorUnits: 750_000_000_00n,
      priority: "HIGH",
    },
  });
}

describe("Deal Intelligence integration (database)", () => {
  afterAll(cleanup);

  it("Test 1 — a high-importance stage change appears in What Changed and is briefing-eligible", async () => {
    await cleanup();
    await makeDeal(DEMO_ORG_ID, TEST_IDS, "Project Test Falcon");

    const event = await createIntelligenceEvent(prisma, {
      organizationId: DEMO_ORG_ID,
      eventType: "STAGE_CHANGED",
      dealId: TEST_IDS.deal,
      headline: "Deal stage changed",
      deltaFrom: "Indicative Bids",
      deltaTo: "Management Meetings",
      confidencePercent: 96,
      occurredAt: DEMO_NOW,
    });

    expect(event.importanceScore).toBeGreaterThanOrEqual(75);

    const since = new Date(DEMO_NOW.getTime() - 24 * 60 * 60 * 1000);
    const summary = await getWhatChangedSince(prisma, DEMO_ORG_ID, since);
    expect(summary.dealsChanged).toBeGreaterThanOrEqual(1);
    expect(summary.topEvents.some((e) => e.id === event.id)).toBe(true);
  });

  it("Test 9 — the same email processed twice does not create a duplicate event", async () => {
    const sourceEmailId = TEST_IDS.dedupeEmail;
    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.dedupeEmailAccount,
        organizationId: DEMO_ORG_ID,
        userId: TEST_IDS.banker,
        provider: "GMAIL",
        emailAddress: "dedupe-fixture@tattava-demo.bank",
      },
    });
    await prisma.emailThread.create({
      data: {
        id: TEST_IDS.dedupeThread,
        emailAccountId: TEST_IDS.dedupeEmailAccount,
        providerThreadId: TEST_IDS.dedupeThread,
        subject: "Test 9 dedupe fixture",
        dealId: TEST_IDS.deal,
        lastMessageAt: DEMO_NOW,
      },
    });
    await prisma.email.create({
      data: {
        id: sourceEmailId,
        threadId: TEST_IDS.dedupeThread,
        providerMessageId: sourceEmailId,
        fromAddress: "buyer@example.com",
        toAddresses: ["dedupe-fixture@tattava-demo.bank"],
        ccAddresses: [],
        subject: "Test 9 dedupe fixture",
        bodyText: "Stage change notice.",
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
      sourceEmailId,
    };

    const first = await createIntelligenceEvent(prisma, params);
    const second = await createIntelligenceEvent(prisma, params);

    expect(second.id).toBe(first.id);
    const count = await prisma.intelligenceEvent.count({ where: { sourceEmailId, eventType: "STAGE_CHANGED" } });
    expect(count).toBe(1);
  });

  it("Test 10 — every material briefing statement maps back to a real source event", async () => {
    const briefing = await generateMorningBriefing(DEMO_ORG_ID, TEST_IDS.banker, DEMO_NOW);
    for (const eventId of briefing.sourceEventIds) {
      const exists = await prisma.intelligenceEvent.findUnique({ where: { id: eventId } });
      expect(exists).not.toBeNull();
      expect(exists!.organizationId).toBe(DEMO_ORG_ID);
    }
  });

  it("organization isolation — one org's intelligence never appears in another org's feed", async () => {
    await prisma.organization.create({ data: { id: TEST_IDS.otherOrg, name: "Other Org", slug: "test-p4-other-org" } });
    await prisma.user.create({ data: { id: TEST_IDS.otherOrgUser, email: "other-org@tattava-demo.bank", authProvider: "GOOGLE" } });
    await prisma.organizationMember.create({
      data: { organizationId: TEST_IDS.otherOrg, userId: TEST_IDS.otherOrgUser, role: "BANKER" },
    });
    await makeDeal(
      TEST_IDS.otherOrg,
      { client: TEST_IDS.otherClient, company: TEST_IDS.otherCompany, workflow: TEST_IDS.otherWorkflow, stage: TEST_IDS.otherStage, deal: TEST_IDS.otherDeal },
      "Project Other Org",
    );

    const otherEvent = await createIntelligenceEvent(prisma, {
      organizationId: TEST_IDS.otherOrg,
      eventType: "RISK_DETECTED",
      dealId: TEST_IDS.otherDeal,
      headline: "Other org risk",
      confidencePercent: 90,
      occurredAt: DEMO_NOW,
    });

    const demoOrgFeed = await getIntelligenceFeed(prisma, DEMO_ORG_ID, { limit: 500 });
    expect(demoOrgFeed.some((e) => e.id === otherEvent.id)).toBe(false);

    const otherOrgFeed = await getIntelligenceFeed(prisma, TEST_IDS.otherOrg, { limit: 500 });
    expect(otherOrgFeed.every((e) => e.organizationId === TEST_IDS.otherOrg)).toBe(true);
    expect(otherOrgFeed.some((e) => e.id === otherEvent.id)).toBe(true);
  });
});
