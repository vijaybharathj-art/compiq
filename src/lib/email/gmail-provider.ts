import type {
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
  WatchHandle,
} from "./types";

// PLANNED INTEGRATION — Gmail API implementation of EmailProvider.
// Requires GOOGLE_CLIENT_ID/SECRET (see .env.example) and the account's
// stored OAuth refresh token (EmailAccount, encrypted at rest — see
// SECURITY.md §3). Not wired into Demo Mode; calling any method throws
// until real Gmail API calls are implemented against `googleapis`.

export class GmailProvider implements EmailProvider {
  async listThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    throw new Error(
      `GmailProvider.listThreads is a planned integration (accountId=${accountId}, since=${since?.toISOString()}). ` +
        "No live Gmail API credentials are configured in this environment.",
    );
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    throw new Error(
      `GmailProvider.getThread is a planned integration (accountId=${accountId}, threadId=${providerThreadId}).`,
    );
  }

  async getAttachment(accountId: string, attachmentId: string): Promise<Buffer> {
    throw new Error(
      `GmailProvider.getAttachment is a planned integration (accountId=${accountId}, attachmentId=${attachmentId}).`,
    );
  }

  async watch(accountId: string): Promise<WatchHandle> {
    throw new Error(`GmailProvider.watch is a planned integration (accountId=${accountId}).`);
  }
}
