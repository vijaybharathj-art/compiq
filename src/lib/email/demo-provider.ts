import { getPrismaClient } from "@/lib/db";
import type {
  EmailAttachmentRef,
  EmailMessage,
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
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
}
