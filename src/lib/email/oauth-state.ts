import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken } from "./token-crypto";

// OAuth CSRF/state handling shared by both provider connect flows (spec
// §10). The state cookie is encrypted (reusing the same AES-256-GCM
// primitive as token storage — a generic "encrypt this string" tool, not
// token-specific) so its payload can't be forged or read by the browser,
// and it binds the callback to the exact user/organization/provider that
// started the flow — the concrete defenses against CSRF, cross-user
// mailbox attachment, and authorization confusion spec §10 names.

export const OAUTH_STATE_COOKIE = "tattava_email_oauth_state";
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real consent flow, short enough to bound replay risk.

export interface OAuthStatePayload {
  nonce: string;
  userId: string;
  organizationId: string;
  provider: "GMAIL" | "OUTLOOK";
  createdAt: number;
}

export function createOAuthState(userId: string, organizationId: string, provider: "GMAIL" | "OUTLOOK"): { nonce: string; cookieValue: string } {
  const nonce = randomBytes(24).toString("base64url");
  const payload: OAuthStatePayload = { nonce, userId, organizationId, provider, createdAt: Date.now() };
  return { nonce, cookieValue: encryptToken(JSON.stringify(payload)) };
}

export type OAuthStateError = "MISSING" | "TAMPERED" | "EXPIRED" | "NONCE_MISMATCH" | "USER_MISMATCH" | "PROVIDER_MISMATCH";

export function verifyOAuthState(
  cookieValue: string | undefined,
  queryNonce: string | undefined,
  currentUserId: string,
  expectedProvider: "GMAIL" | "OUTLOOK",
): { ok: true; payload: OAuthStatePayload } | { ok: false; error: OAuthStateError } {
  if (!cookieValue || !queryNonce) return { ok: false, error: "MISSING" };

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(decryptToken(cookieValue)) as OAuthStatePayload;
  } catch {
    return { ok: false, error: "TAMPERED" };
  }

  if (Date.now() - payload.createdAt > MAX_AGE_MS) return { ok: false, error: "EXPIRED" };
  if (payload.nonce !== queryNonce) return { ok: false, error: "NONCE_MISMATCH" };
  if (payload.userId !== currentUserId) return { ok: false, error: "USER_MISMATCH" };
  if (payload.provider !== expectedProvider) return { ok: false, error: "PROVIDER_MISMATCH" };

  return { ok: true, payload };
}
