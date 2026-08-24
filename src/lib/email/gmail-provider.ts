import type {
  EmailAttachmentRef,
  EmailMessage,
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
  WatchHandle,
} from "./types";

// PLANNED INTEGRATION — Gmail API implementation of EmailProvider.
// Requires GOOGLE_CLIENT_ID/SECRET (see .env.example) and the account's
// stored OAuth refresh token (EmailAccount, encrypted at rest — see
// SECURITY.md §3). Not wired into Demo Mode; calling any method throws
// until real Gmail API calls are implemented against `googleapis`. The
// future implementation is expected to support: initial historical sync,
// incremental sync via historyId, push notifications (watch/stop),
// exponential-backoff retries against rate limits, and reconciling deleted
// messages — see PHASE3_EMAIL_INTELLIGENCE.md §35.

export class GmailProvider implements EmailProvider {
  async getThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    throw new Error(
      `GmailProvider.getThreads is a planned integration (accountId=${accountId}, since=${since?.toISOString()}). ` +
        "No live Gmail API credentials are configured in this environment.",
    );
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    throw new Error(
      `GmailProvider.getThread is a planned integration (accountId=${accountId}, threadId=${providerThreadId}).`,
    );
  }

  async getMessages(accountId: string, providerThreadId: string): Promise<EmailMessage[]> {
    throw new Error(
      `GmailProvider.getMessages is a planned integration (accountId=${accountId}, threadId=${providerThreadId}).`,
    );
  }

  async getMessage(accountId: string, providerMessageId: string): Promise<EmailMessage> {
    throw new Error(
      `GmailProvider.getMessage is a planned integration (accountId=${accountId}, messageId=${providerMessageId}).`,
    );
  }

  async getNewMessages(accountId: string, since?: Date): Promise<EmailMessage[]> {
    throw new Error(
      `GmailProvider.getNewMessages is a planned integration (accountId=${accountId}, since=${since?.toISOString()}).`,
    );
  }

  async getAttachments(accountId: string, providerMessageId: string): Promise<EmailAttachmentRef[]> {
    throw new Error(
      `GmailProvider.getAttachments is a planned integration (accountId=${accountId}, messageId=${providerMessageId}).`,
    );
  }

  async downloadAttachment(accountId: string, attachmentId: string): Promise<Buffer> {
    throw new Error(
      `GmailProvider.downloadAttachment is a planned integration (accountId=${accountId}, attachmentId=${attachmentId}).`,
    );
  }

  async markProcessed(accountId: string, providerMessageId: string): Promise<void> {
    throw new Error(
      `GmailProvider.markProcessed is a planned integration (accountId=${accountId}, messageId=${providerMessageId}).`,
    );
  }

  async watch(accountId: string): Promise<WatchHandle> {
    throw new Error(`GmailProvider.watch is a planned integration (accountId=${accountId}).`);
  }
}
