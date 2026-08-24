import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Server-side encryption for OAuth access/refresh tokens at rest (spec
// §9, §59 — "never expose tokens," "implement an appropriate server-side
// encryption mechanism"). AES-256-GCM: a random 12-byte IV per encryption
// plus the auth tag, both stored alongside the ciphertext so decryption
// needs only the one persisted string and the server-only key below.
// Never imported by any client component — this module has no "use
// client" boundary and touches Node's crypto module directly, so a
// bundler error is the loud failure mode if it's ever pulled into client
// code by mistake.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const secret = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY is not set — required to store or read OAuth tokens. " +
        "Generate one with: openssl rand -base64 32",
    );
  }
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error(
      `EMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

/** Encrypts a token for storage. Returns `iv.authTag.ciphertext`, each base64url. */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Reverses encryptToken(). Throws if the ciphertext or key is invalid/tampered. */
export function decryptToken(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted token — expected iv.authTag.ciphertext.");
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
