import { describe, expect, it, beforeAll } from "vitest";
import { encryptToken, decryptToken } from "@/lib/email/token-crypto";

// PHASE5_REAL_EMAIL_INTEGRATION.md §9 — OAuth tokens must never be stored
// in plaintext. A fixed test key (not a real secret) so this suite is
// self-contained and doesn't depend on the developer's real
// EMAIL_TOKEN_ENCRYPTION_KEY being set.

beforeAll(() => {
  process.env.EMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    const token = "ya29.a0AfH6SMBexample-refresh-token-value";
    const encrypted = encryptToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const token = "same-token-value";
    expect(encryptToken(token)).not.toBe(encryptToken(token));
  });

  it("throws on tampered ciphertext rather than returning garbage", () => {
    const encrypted = encryptToken("a-real-token");
    const [iv, authTag, ciphertext] = encrypted.split(".");
    const tampered = [iv, authTag, ciphertext!.slice(0, -2) + "AA"].join(".");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws a clear error when the encryption key is missing", () => {
    const original = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow(/EMAIL_TOKEN_ENCRYPTION_KEY/);
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = original;
  });
});
