import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §25 — the cron endpoint must never
// be publicly executable. These are pure auth-boundary tests: no database
// call happens on the rejected paths (verified by never mocking/needing
// one here), matching the route's own short-circuit before touching
// runScheduledSyncs().

const ORIGINAL_ENV = { ...process.env };

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/email-sync", { headers });
}

describe("GET /api/cron/email-sync — authentication", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("refuses to run at all if CRON_SECRET is not configured, even with a matching-looking header", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/email-sync/route");
    const res = await GET(makeRequest({ authorization: "Bearer undefined" }));
    expect(res.status).toBe(500);
  });

  it("rejects a request with no Authorization header", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/cron/email-sync/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/cron/email-sync/route");
    const res = await GET(makeRequest({ authorization: "Bearer not-the-secret" }));
    expect(res.status).toBe(401);
  });

  it("rejects a differently-shaped Authorization header (not Bearer)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/cron/email-sync/route");
    const res = await GET(makeRequest({ authorization: "test-cron-secret" }));
    expect(res.status).toBe(401);
  });
});
