import type {
  EmailAttachmentRef,
  EmailMessage,
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
  WatchHandle,
} from "./types";

// PLANNED INTEGRATION — Microsoft Graph implementation of EmailProvider
// (Outlook / Microsoft 365 mailboxes). Requires MICROSOFT_CLIENT_ID/SECRET
// (see .env.example) and the account's stored OAuth refresh token
// (EmailAccount, encrypted at rest — see SECURITY.md §3). Not wired into
// Demo Mode; calling any method throws until real Graph API calls are
// implemented. The future implementation is expected to support: initial
// historical sync, incremental sync via delta queries, webhook
// subscriptions (renewed before expiry), token refresh, rate-limit
// backoff/retry, and reconciling deleted messages — see
// PHASE3_EMAIL_INTELLIGENCE.md §35.

export class MicrosoftGraphProvider implements EmailProvider {
  async getThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    throw new Error(
      `MicrosoftGraphProvider.getThreads is a planned integration (accountId=${accountId}, since=${since?.toISOString()}). ` +
        "No live Microsoft Graph credentials are configured in this environment.",
    );
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    throw new Error(
      `MicrosoftGraphProvider.getThread is a planned integration (accountId=${accountId}, threadId=${providerThreadId}).`,
    );
  }

  async getMessages(accountId: string, providerThreadId: string): Promise<EmailMessage[]> {
    throw new Error(
      `MicrosoftGraphProvider.getMessages is a planned integration (accountId=${accountId}, threadId=${providerThreadId}).`,
    );
  }

  async getMessage(accountId: string, providerMessageId: string): Promise<EmailMessage> {
    throw new Error(
      `MicrosoftGraphProvider.getMessage is a planned integration (accountId=${accountId}, messageId=${providerMessageId}).`,
    );
  }

  async getNewMessages(accountId: string, since?: Date): Promise<EmailMessage[]> {
    throw new Error(
      `MicrosoftGraphProvider.getNewMessages is a planned integration (accountId=${accountId}, since=${since?.toISOString()}).`,
    );
  }

  async getAttachments(accountId: string, providerMessageId: string): Promise<EmailAttachmentRef[]> {
    throw new Error(
      `MicrosoftGraphProvider.getAttachments is a planned integration (accountId=${accountId}, messageId=${providerMessageId}).`,
    );
  }

  async downloadAttachment(accountId: string, attachmentId: string): Promise<Buffer> {
    throw new Error(
      `MicrosoftGraphProvider.downloadAttachment is a planned integration (accountId=${accountId}, attachmentId=${attachmentId}).`,
    );
  }

  async markProcessed(accountId: string, providerMessageId: string): Promise<void> {
    throw new Error(
      `MicrosoftGraphProvider.markProcessed is a planned integration (accountId=${accountId}, messageId=${providerMessageId}).`,
    );
  }

  async watch(accountId: string): Promise<WatchHandle> {
    throw new Error(`MicrosoftGraphProvider.watch is a planned integration (accountId=${accountId}).`);
  }
}
