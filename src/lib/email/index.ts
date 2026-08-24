import { GmailProvider } from "./gmail-provider";
import { MicrosoftGraphProvider } from "./microsoft-graph-provider";
import { DemoEmailProvider } from "./demo-provider";
import type { EmailProvider } from "./types";

export type { EmailProvider } from "./types";
export * from "./types";
export { DemoEmailProvider } from "./demo-provider";

const gmailProvider = new GmailProvider();
const microsoftGraphProvider = new MicrosoftGraphProvider();
let demoProvider: DemoEmailProvider | undefined;

/**
 * Resolves the EmailProvider implementation for a connected mailbox by its
 * nominal provider type. Used once real OAuth exists — see ARCHITECTURE.md §3.
 */
export function getEmailProviderFor(provider: "GMAIL" | "OUTLOOK"): EmailProvider {
  switch (provider) {
    case "GMAIL":
      return gmailProvider;
    case "OUTLOOK":
      return microsoftGraphProvider;
  }
}

/**
 * Resolves the EmailProvider the pipeline actually runs against, reading
 * `EMAIL_PROVIDER` ("demo" | "live", default "demo") — mirrors
 * getAIProvider()'s pattern (src/lib/ai/index.ts). In Demo Mode this is
 * DemoEmailProvider regardless of any seeded EmailAccount's nominal
 * provider label; "live" dispatches per-account via getEmailProviderFor().
 */
export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "live") {
    throw new Error(
      "EMAIL_PROVIDER=live requires per-account dispatch via getEmailProviderFor() plus real OAuth — not available in this environment.",
    );
  }
  if (!demoProvider) demoProvider = new DemoEmailProvider();
  return demoProvider;
}
