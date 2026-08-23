import { GmailProvider } from "./gmail-provider";
import { OutlookProvider } from "./outlook-provider";
import type { EmailProvider } from "./types";

export type { EmailProvider } from "./types";
export * from "./types";

const gmailProvider = new GmailProvider();
const outlookProvider = new OutlookProvider();

/**
 * Resolves the EmailProvider implementation for a connected mailbox.
 * A third provider is a new class implementing EmailProvider plus one
 * branch here — see ARCHITECTURE.md §3.
 */
export function getEmailProvider(provider: "GMAIL" | "OUTLOOK"): EmailProvider {
  switch (provider) {
    case "GMAIL":
      return gmailProvider;
    case "OUTLOOK":
      return outlookProvider;
  }
}
