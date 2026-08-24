import { describe, expect, it } from "vitest";
import {
  prismaAuditLogRepository,
  prismaClientRepository,
  prismaDashboardRepository,
  prismaDealRepository,
  prismaIntelligenceRepository,
  prismaReferenceRepository,
  prismaTaskRepository,
} from "@/lib/data/prisma-repository";

// Integration tests against the real seeded Postgres database (see
// prisma/seed.ts). Requires DATABASE_URL and a completed `npx tsx
// prisma/seed.ts` run — same database the app itself reads from.

describe("prismaDealRepository (database)", () => {
  it("lists at least the 25 seeded deals", async () => {
    const deals = await prismaDealRepository.list();
    expect(deals.length).toBeGreaterThanOrEqual(25);
  });

  it("filters by banking service", async () => {
    const maDeals = await prismaDealRepository.list({ bankingService: "MA" });
    expect(maDeals.length).toBeGreaterThan(0);
    for (const deal of maDeals) {
      expect(deal.bankingServiceId).toBe("MA");
    }
  });

  it("returns the curated Project Falcon deal with expected fields", async () => {
    const falcon = await prismaDealRepository.get("deal-falcon");
    expect(falcon).not.toBeNull();
    expect(falcon?.projectCodename).toBe("Project Falcon");
    expect(falcon?.clientName).toBe("Acme Industries");
    expect(falcon?.value?.amountMinorUnits).toBe(75_000_000_000);
    expect(falcon?.timeline.length).toBeGreaterThan(0);
    expect(falcon?.teamMembers.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown deal id", async () => {
    const missing = await prismaDealRepository.get("deal-does-not-exist");
    expect(missing).toBeNull();
  });
});

describe("prismaClientRepository (database)", () => {
  it("lists at least the 10 seeded clients", async () => {
    const clients = await prismaClientRepository.list();
    expect(clients.length).toBeGreaterThanOrEqual(10);
  });

  it("returns Acme Industries with its engagements", async () => {
    const acme = await prismaClientRepository.get("client-acme");
    expect(acme).not.toBeNull();
    expect(acme?.deals.length).toBeGreaterThan(0);
    expect(acme?.opportunities).toBeDefined();
  });
});

describe("prismaTaskRepository (database)", () => {
  it("lists at least the 40 seeded tasks", async () => {
    const tasks = await prismaTaskRepository.list();
    expect(tasks.length).toBeGreaterThanOrEqual(40);
  });

  it("filters by status", async () => {
    const todo = await prismaTaskRepository.list({ status: "TODO" });
    for (const task of todo) {
      expect(task.status).toBe("TODO");
    }
  });
});

describe("prismaIntelligenceRepository (database)", () => {
  it("lists at least the 50 seeded intelligence events", async () => {
    const events = await prismaIntelligenceRepository.list();
    expect(events.length).toBeGreaterThanOrEqual(50);
  });

  it("filters by category", async () => {
    const risks = await prismaIntelligenceRepository.list("RISK");
    for (const item of risks) {
      expect(item.category).toBe("RISK");
    }
  });
});

describe("prismaDashboardRepository (database)", () => {
  it("aggregates portfolio stats", async () => {
    const data = await prismaDashboardRepository.get();
    expect(data.stats.activeDeals).toBeGreaterThanOrEqual(25);
    expect(data.stats.totalDealValueMinorUnits).toBeGreaterThan(0);
    expect(data.todaysIntelligence.length).toBeGreaterThan(0);
  });
});

describe("prismaReferenceRepository (database)", () => {
  it("lists sectors and bankers", async () => {
    const [sectors, bankers] = await Promise.all([
      prismaReferenceRepository.sectors(),
      prismaReferenceRepository.bankers(),
    ]);
    expect(sectors.length).toBeGreaterThan(0);
    expect(bankers.length).toBeGreaterThanOrEqual(12);
    expect(bankers.every((b) => b.title.length > 0)).toBe(true);
  });
});

describe("prismaAuditLogRepository (database)", () => {
  it("lists seeded audit entries", async () => {
    const entries = await prismaAuditLogRepository.list();
    expect(entries.length).toBeGreaterThan(0);
  });
});
