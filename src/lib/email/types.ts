// EmailProvider abstraction — see ARCHITECTURE.md §3. Implementations:
// GmailProvider (Gmail API), OutlookProvider (Microsoft Graph API).
// Selected at runtime via getEmailProvider() based on EmailAccount.provider.

export interface EmailAttachmentRef {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EmailMessage {
  providerMessageId: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
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

export interface EmailProvider {
  /** Lists threads touched since `since` (or all recent threads on first sync). */
  listThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]>;
  getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail>;
  getAttachment(accountId: string, attachmentId: string): Promise<Buffer>;
  /** Registers push notifications where the provider supports it (Gmail watch / Graph subscriptions). */
  watch(accountId: string): Promise<WatchHandle>;
}
