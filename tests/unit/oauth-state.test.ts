import { describe, expect, it, beforeAll } from "vitest";
import { createOAuthState, verifyOAuthState } from "@/lib/email/oauth-state";

// PHASE5_REAL_EMAIL_INTEGRATION.md §10 — the OAuth callback's CSRF/
// account-linking defenses, exercised directly against the state
// create/verify pair (no HTTP involved).

beforeAll(() => {
  process.env.EMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
});

describe("OAuth state", () => {
  it("round-trips and verifies for the matching user/provider", () => {
    const { nonce, cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    const result = verifyOAuthState(cookieValue, nonce, "user-1", "GMAIL");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userId).toBe("user-1");
      expect(result.payload.organizationId).toBe("org-1");
    }
  });

  it("rejects a missing cookie or nonce", () => {
    expect(verifyOAuthState(undefined, "n", "user-1", "GMAIL")).toEqual({ ok: false, error: "MISSING" });
    const { cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    expect(verifyOAuthState(cookieValue, undefined, "user-1", "GMAIL")).toEqual({ ok: false, error: "MISSING" });
  });

  it("rejects a tampered cookie", () => {
    const { nonce, cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    const tampered = cookieValue.slice(0, -4) + "abcd";
    expect(verifyOAuthState(tampered, nonce, "user-1", "GMAIL").ok).toBe(false);
  });

  it("rejects a nonce that doesn't match the callback's query param (CSRF)", () => {
    const { cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    expect(verifyOAuthState(cookieValue, "wrong-nonce", "user-1", "GMAIL")).toEqual({ ok: false, error: "NONCE_MISMATCH" });
  });

  it("rejects a callback completed as a different user than started it (account-linking attack)", () => {
    const { nonce, cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    expect(verifyOAuthState(cookieValue, nonce, "user-2", "GMAIL")).toEqual({ ok: false, error: "USER_MISMATCH" });
  });

  it("rejects a provider mismatch (state minted for Gmail redeemed on the Microsoft callback)", () => {
    const { nonce, cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    expect(verifyOAuthState(cookieValue, nonce, "user-1", "OUTLOOK")).toEqual({ ok: false, error: "PROVIDER_MISMATCH" });
  });

  it("rejects an expired state", () => {
    const { nonce, cookieValue } = createOAuthState("user-1", "org-1", "GMAIL");
    const original = Date.now;
    Date.now = () => original() + 11 * 60 * 1000;
    try {
      expect(verifyOAuthState(cookieValue, nonce, "user-1", "GMAIL")).toEqual({ ok: false, error: "EXPIRED" });
    } finally {
      Date.now = original;
    }
  });
});
