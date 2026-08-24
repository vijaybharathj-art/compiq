import { GmailProvider } from "./gmail-provider";
import { MicrosoftGraphProvider } from "./microsoft-graph-provider";
import { DemoEmailProvider } from "./demo-provider";
import type { EmailProvider, OAuthEmailProvider } from "./types";

export type { EmailProvider } from "./types";
export * from "./types";
export { DemoEmailProvider } from "./demo-provider";
export { GmailProvider, GMAIL_SCOPE } from "./gmail-provider";
export { MicrosoftGraphProvider, MICROSOFT_SCOPES } from "./microsoft-graph-provider";

const gmailProvider = new GmailProvider();
const microsoftGraphProvider = new MicrosoftGraphProvider();
let demoProvider: DemoEmailProvider | undefined;

/**
 * Resolves the EmailProvider implementation for a connected mailbox by its
 * nominal provider type — real Gmail/Microsoft Graph implementations as
 * of Phase 5 (PHASE5_REAL_EMAIL_INTEGRATION.md). The sync engine
 * (src/lib/email/sync-engine.ts) dispatches per-EmailAccount through this
 * function, independent of getEmailProvider()'s org-wide Demo Mode toggle
 * below — real per-account sync never goes through DemoEmailProvider.
 */
export function getEmailProviderFor(provider: "GMAIL" | "OUTLOOK"): EmailProvider {
  switch (provider) {
    case "GMAIL":
      return gmailProvider;
    case "OUTLOOK":
      return microsoftGraphProvider;
  }
}

/** Same dispatch as getEmailProviderFor(), narrowed to the OAuth-capable subset — used by the OAuth connect/callback routes. */
export function getOAuthProviderFor(provider: "GMAIL" | "OUTLOOK"): OAuthEmailProvider {
  return getEmailProviderFor(provider) as unknown as OAuthEmailProvider;
}

/**
 * Resolves the EmailProvider the Phase 3 pipeline's `runScan()` runs
 * against, reading `EMAIL_PROVIDER` ("demo" | "live", default "demo") —
 * mirrors getAIProvider()'s pattern (src/lib/ai/index.ts). Deliberately
 * unchanged by Phase 5: Demo Mode's org-wide "Run Scan" still always
 * resolves to DemoEmailProvider regardless of any real connected
 * EmailAccount, since a real sync always names a specific account and
 * goes through getEmailProviderFor() / the sync engine instead — never
 * through this function.
 */
export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "live") {
    throw new Error(
      "EMAIL_PROVIDER=live requires per-account dispatch via getEmailProviderFor() — the org-wide Demo Mode scan has no single account to run against.",
    );
  }
  if (!demoProvider) demoProvider = new DemoEmailProvider();
  return demoProvider;
}
