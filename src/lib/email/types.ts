// EmailProvider abstraction — see ARCHITECTURE.md §3 and
// PHASE3_EMAIL_INTELLIGENCE.md §2. Implementations: DemoEmailProvider
// (live, backed by the seeded Postgres mailbox), GmailProvider,
// MicrosoftGraphProvider (both planned integrations — throw until real
// OAuth exists). Selected via getEmailProvider() / getEmailProviderFor().

export interface EmailAttachmentRef {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EmailMessage {
  id: string;
  providerMessageId: string;
  providerThreadId: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
  attachments: EmailAttachmentRef[];
}

export interface EmailThreadSummary {
  providerThreadId: string;
  subject: string;
  participantSummary: string;
  lastMessageAt: Date;
}

export interface EmailThreadDetail extends EmailThreadSummary {
  messages: EmailMessage[];
}

export interface WatchHandle {
  expiresAt: Date;
  resourceId: string;
}

/**
 * Common interface every mailbox source implements — a controlled demo
 * provider today, Gmail/Microsoft Graph once OAuth is live (spec §35).
 * Nothing in the pipeline (src/lib/pipeline/) imports a concrete provider
 * class directly; it only depends on this interface.
 */
export interface EmailProvider {
  /** Threads touched since `since` (or all recent threads on first sync). */
  getThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]>;
  getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail>;
  /** All messages within one thread, in provider order. */
  getMessages(accountId: string, providerThreadId: string): Promise<EmailMessage[]>;
  getMessage(accountId: string, providerMessageId: string): Promise<EmailMessage>;
  /**
   * Flat list of messages the pipeline hasn't ingested yet — the unit of
   * work a "Run Scan" invocation pulls from (spec §26/§34).
   */
  getNewMessages(accountId: string, since?: Date): Promise<EmailMessage[]>;
  getAttachments(accountId: string, providerMessageId: string): Promise<EmailAttachmentRef[]>;
  downloadAttachment(accountId: string, attachmentId: string): Promise<Buffer>;
  /** Marks a message as ingested at the provider (a label/flag on real providers). */
  markProcessed(accountId: string, providerMessageId: string): Promise<void>;
  /** Registers push notifications where the provider supports it (Gmail watch / Graph subscriptions). */
  watch(accountId: string): Promise<WatchHandle>;
}
