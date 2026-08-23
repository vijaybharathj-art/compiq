import type {
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
  WatchHandle,
} from "./types";

// PLANNED INTEGRATION — Microsoft Graph API implementation of EmailProvider.
// Requires MICROSOFT_CLIENT_ID/SECRET (see .env.example) and the account's
// stored OAuth refresh token (EmailAccount, encrypted at rest — see
// SECURITY.md §3). Not wired into Demo Mode; calling any method throws
// until real Graph API calls are implemented against `@microsoft/microsoft-graph-client`.

export class OutlookProvider implements EmailProvider {
  async listThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    throw new Error(
      `OutlookProvider.listThreads is a planned integration (accountId=${accountId}, since=${since?.toISOString()}). ` +
        "No live Microsoft Graph credentials are configured in this environment.",
    );
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    throw new Error(
      `OutlookProvider.getThread is a planned integration (accountId=${accountId}, threadId=${providerThreadId}).`,
    );
  }

  async getAttachment(accountId: string, attachmentId: string): Promise<Buffer> {
    throw new Error(
      `OutlookProvider.getAttachment is a planned integration (accountId=${accountId}, attachmentId=${attachmentId}).`,
    );
  }

  async watch(accountId: string): Promise<WatchHandle> {
    throw new Error(`OutlookProvider.watch is a planned integration (accountId=${accountId}).`);
  }
}
