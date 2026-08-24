import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getAIProvider } from "@/lib/ai";
import { matchDeal } from "@/lib/pipeline/matching";

// Test 6 (PHASE3_EMAIL_INTELLIGENCE.md §29): multiple emails referencing
// the same project codename must all resolve to one deal — never a
// duplicate. Builds a self-contained fixture deal/thread/emails rather
// than depending on prisma/seed.ts's state, so this test is deterministic
// and independently rerunnable.

const prisma = getPrismaClient();

const TEST_IDS = {
  client: "test-matching-client",
  company: "test-matching-company",
  workflow: "test-matching-workflow",
  stage: "test-matching-stage",
  deal: "test-matching-deal",
  account: "test-matching-account",
  thread: "test-matching-thread",
  email1: "test-matching-email-1",
  email2: "test-matching-email-2",
};

async function cleanup() {
  await prisma.email.deleteMany({ where: { id: { in: [TEST_IDS.email1, TEST_IDS.email2] } } });
  await prisma.emailThread.deleteMany({ where: { id: TEST_IDS.thread } });
  await prisma.emailAccount.deleteMany({ where: { id: TEST_IDS.account } });
  await prisma.deal.deleteMany({ where: { id: TEST_IDS.deal } });
  await prisma.dealStageDefinition.deleteMany({ where: { id: TEST_IDS.stage } });
  await prisma.dealWorkflow.deleteMany({ where: { id: TEST_IDS.workflow } });
  await prisma.client.deleteMany({ where: { id: TEST_IDS.client } });
  await prisma.company.deleteMany({ where: { id: TEST_IDS.company } });
}

describe("deal matching engine — one codename, one deal (database)", () => {
  afterAll(cleanup);

  it("two independent emails naming the same project codename resolve to the same dealId", async () => {
    await cleanup();

    const bankingService = await prisma.bankingService.findFirstOrThrow({ where: { code: "MA" } });

    await prisma.client.create({
      data: { id: TEST_IDS.client, organizationId: DEMO_ORG_ID, name: "Test Matching Client", relationshipStatus: "ACTIVE" },
    });
    await prisma.company.create({
      data: { id: TEST_IDS.company, organizationId: DEMO_ORG_ID, name: "Test Matching Client", isClientEntity: true },
    });
    await prisma.dealWorkflow.create({
      data: { id: TEST_IDS.workflow, bankingServiceId: bankingService.id, name: "Test Workflow" },
    });
    const stage = await prisma.dealStageDefinition.create({
      data: { id: TEST_IDS.stage, workflowId: TEST_IDS.workflow, key: "origination", label: "Origination", sortOrder: 0 },
    });
    await prisma.deal.create({
      data: {
        id: TEST_IDS.deal,
        organizationId: DEMO_ORG_ID,
        projectCodename: "Project Zephyr",
        clientId: TEST_IDS.client,
        bankingServiceId: bankingService.id,
        dealType: "SELL_SIDE_MA",
        workflowId: TEST_IDS.workflow,
        currentStageId: stage.id,
      },
    });
    await prisma.emailAccount.create({
      data: {
        id: TEST_IDS.account,
        organizationId: DEMO_ORG_ID,
        userId: "banker-bharath",
        provider: "GMAIL",
        emailAddress: "test-matching@tattava-demo.bank",
      },
    });
    // Deliberately NOT linking this thread to the deal up front — matching
    // must resolve it from content alone, twice, to the same deal.
    await prisma.emailThread.create({
      data: {
        id: TEST_IDS.thread,
        emailAccountId: TEST_IDS.account,
        providerThreadId: TEST_IDS.thread,
        subject: "Project Zephyr",
        lastMessageAt: new Date(),
      },
    });
    await prisma.email.createMany({
      data: [
        {
          id: TEST_IDS.email1,
          threadId: TEST_IDS.thread,
          providerMessageId: "zephyr-msg-1",
          fromAddress: "contact@testmatching.example",
          subject: "Project Zephyr — teaser",
          bodyText: "Please find attached the Project Zephyr teaser.",
          receivedAt: new Date(),
        },
        {
          id: TEST_IDS.email2,
          threadId: TEST_IDS.thread,
          providerMessageId: "zephyr-msg-2",
          fromAddress: "contact@testmatching.example",
          subject: "Re: Project Zephyr",
          bodyText: "Buyer A is interested in Project Zephyr and would like management access.",
          receivedAt: new Date(),
        },
      ],
    });

    const aiProvider = getAIProvider();
    const extraction1 = await aiProvider.extractEntities(
      {
        emailId: TEST_IDS.email1,
        fromAddress: "contact@testmatching.example",
        toAddresses: [],
        ccAddresses: [],
        subject: "Project Zephyr — teaser",
        bodyText: "Please find attached the Project Zephyr teaser.",
        sentAt: new Date().toISOString(),
      },
      { organizationId: DEMO_ORG_ID, candidateDeals: [] },
    );
    const match1 = await matchDeal(prisma, aiProvider, DEMO_ORG_ID, TEST_IDS.thread, TEST_IDS.client, extraction1);

    const extraction2 = await aiProvider.extractEntities(
      {
        emailId: TEST_IDS.email2,
        fromAddress: "contact@testmatching.example",
        toAddresses: [],
        ccAddresses: [],
        subject: "Re: Project Zephyr",
        bodyText: "Buyer A is interested in Project Zephyr and would like management access.",
        sentAt: new Date().toISOString(),
      },
      { organizationId: DEMO_ORG_ID, candidateDeals: [] },
    );
    const match2 = await matchDeal(prisma, aiProvider, DEMO_ORG_ID, TEST_IDS.thread, TEST_IDS.client, extraction2);

    expect(match1.matchType).toBe("EXISTING_DEAL");
    expect(match1.dealId).toBe(TEST_IDS.deal);
    expect(match2.matchType).toBe("EXISTING_DEAL");
    expect(match2.dealId).toBe(TEST_IDS.deal);

    const dealsWithCodename = await prisma.deal.count({
      where: { organizationId: DEMO_ORG_ID, projectCodename: "Project Zephyr" },
    });
    expect(dealsWithCodename).toBe(1);
  });
});
