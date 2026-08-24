import { getPrismaClient } from "@/lib/db";
import { EmailProviderError } from "./types";
import type {
  ConnectionStatus,
  EmailAttachmentRef,
  EmailMessage,
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
  SyncOptions,
  SyncPage,
  WatchHandle,
} from "./types";

const db = getPrismaClient();

// DemoEmailProvider — a genuine EmailProvider implementation backed by the
// seeded Postgres mailbox (prisma/seed.ts), not a mock. It is what "Run
// Scan" (spec §26) actually calls: getNewMessages() returns every Email row
// with processingStatus=PENDING for the account, in received order, and
// markProcessed() flips that row to PROCESSED — the same call shape a real
// GmailProvider/MicrosoftGraphProvider would fulfil against a live mailbox.

function toEmailMessage(row: {
  id: string;
  providerMessageId: string;
  thread: { providerThreadId: string };
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
  attachments: { id: string; filename: string; mimeType: string; sizeBytes: number }[];
}): EmailMessage {
  return {
    id: row.id,
    providerMessageId: row.providerMessageId,
    providerThreadId: row.thread.providerThreadId,
    fromAddress: row.fromAddress,
    fromName: row.fromName ?? undefined,
    toAddresses: row.toAddresses,
    ccAddresses: row.ccAddresses,
    bccAddresses: [],
    subject: row.subject,
    bodyText: row.bodyText,
    receivedAt: row.receivedAt,
    attachments: row.attachments,
  };
}

export class DemoEmailProvider implements EmailProvider {
  async getThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    const threads = await db.emailThread.findMany({
      where: { emailAccountId: accountId, ...(since ? { lastMessageAt: { gte: since } } : {}) },
      orderBy: { lastMessageAt: "desc" },
    });
    return threads.map((t) => ({
      providerThreadId: t.providerThreadId,
      subject: t.subject,
      participantSummary: t.participantSummary ?? "",
      lastMessageAt: t.lastMessageAt,
    }));
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    const thread = await db.emailThread.findFirstOrThrow({
      where: { emailAccountId: accountId, providerThreadId },
      include: { emails: { include: { attachments: true, thread: true }, orderBy: { receivedAt: "asc" } } },
    });
    return {
      providerThreadId: thread.providerThreadId,
      subject: thread.subject,
      participantSummary: thread.participantSummary ?? "",
      lastMessageAt: thread.lastMessageAt,
      messages: thread.emails.map(toEmailMessage),
    };
  }

  async getMessages(accountId: string, providerThreadId: string): Promise<EmailMessage[]> {
    const thread = await this.getThread(accountId, providerThreadId);
    return thread.messages;
  }

  async getMessage(accountId: string, providerMessageId: string): Promise<EmailMessage> {
    const row = await db.email.findFirstOrThrow({
      where: { providerMessageId, thread: { emailAccountId: accountId } },
      include: { attachments: true, thread: true },
    });
    return toEmailMessage(row);
  }

  async getNewMessages(accountId: string, since?: Date): Promise<EmailMessage[]> {
    const rows = await db.email.findMany({
      where: {
        thread: { emailAccountId: accountId },
        processingStatus: "PENDING",
        ...(since ? { receivedAt: { gte: since } } : {}),
      },
      include: { attachments: true, thread: true },
      orderBy: { receivedAt: "asc" },
    });
    return rows.map(toEmailMessage);
  }

  async getAttachments(accountId: string, providerMessageId: string): Promise<EmailAttachmentRef[]> {
    const row = await db.email.findFirstOrThrow({
      where: { providerMessageId, thread: { emailAccountId: accountId } },
      include: { attachments: true },
    });
    return row.attachments;
  }

  async downloadAttachment(): Promise<Buffer> {
    throw new Error("DemoEmailProvider does not store attachment binaries — demo data is metadata-only.");
  }

  async markProcessed(accountId: string, providerMessageId: string): Promise<void> {
    await db.email.updateMany({
      where: { providerMessageId, thread: { emailAccountId: accountId } },
      data: { processingStatus: "PROCESSED", processedAt: new Date() },
    });
  }

  async watch(accountId: string): Promise<WatchHandle> {
    return { expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), resourceId: `demo-watch-${accountId}` };
  }

  // Demo's one mailbox is pre-seeded, never "connected" via OAuth — these
  // implementations are honest no-ops/reads rather than throwing, so
  // Settings → Email can still render a connection card for it without a
  // provider-type branch in the UI.

  async disconnect(accountId: string): Promise<void> {
    await db.emailAccount.updateMany({ where: { id: accountId }, data: { connectionStatus: "DISCONNECTED" } });
  }

  async getConnectionStatus(accountId: string): Promise<ConnectionStatus> {
    const account = await db.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) return { connected: false, needsReauth: false, error: "Account not found." };
    return {
      connected: account.connectionStatus === "CONNECTED",
      needsReauth: account.connectionStatus === "NEEDS_REAUTH",
      emailAddress: account.emailAddress,
      lastSyncedAt: account.lastSyncedAt ?? undefined,
      lastSuccessfulSyncAt: account.lastSuccessfulSyncAt ?? undefined,
      error: account.connectionError ?? undefined,
    };
  }

  async refreshAuthentication(): Promise<void> {
    // No real token to refresh — the seeded demo account never expires.
  }

  handleProviderError(error: unknown): EmailProviderError {
    if (error instanceof EmailProviderError) return error;
    return new EmailProviderError("UNKNOWN_PROVIDER_ERROR", "Unexpected demo provider error.", error);
  }

  async initialSync(accountId: string, options: SyncOptions): Promise<SyncPage> {
    const windowStart = new Date(Date.now() - (options.windowDays ?? 90) * 24 * 60 * 60 * 1000);
    const messages = await this.getNewMessages(accountId, windowStart);
    return { messages, hasMore: false };
  }

  async incrementalSync(accountId: string, options: SyncOptions): Promise<SyncPage> {
    const since = options.cursor ? new Date(options.cursor) : undefined;
    const messages = await this.getNewMessages(accountId, since);
    return { messages, hasMore: false, syncStateCursor: new Date().toISOString() };
  }
}
