// EmailProvider abstraction — see ARCHITECTURE.md §3,
// PHASE3_EMAIL_INTELLIGENCE.md §2, and PHASE5_REAL_EMAIL_INTEGRATION.md
// §5-6. Implementations: DemoEmailProvider (live, seeded Postgres
// mailbox), GmailProvider, MicrosoftGraphProvider (both real — Phase 5 —
// but never live-tested against a real mailbox in this environment; see
// the Phase 5 doc for exactly what that means). Selected via
// getEmailProvider() / getEmailProviderFor().

export interface EmailAttachmentRef {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * The provider-independent email shape every pipeline stage consumes
 * (spec §6). Provider-specific fields never leak past normalization —
 * GmailProvider/MicrosoftGraphProvider map their own API shapes into this
 * one, and nothing downstream (classification, extraction, matching)
 * knows or cares which provider produced a given message.
 */
export interface EmailMessage {
  id: string;
  providerMessageId: string;
  providerThreadId: string;
  /** The RFC 5322 Message-ID header, when the provider exposes it — stable across providers, unlike providerMessageId. */
  internetMessageId?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  replyTo?: string;
  /** RFC 5322 In-Reply-To — the immediate parent message, used by threading (spec §19). */
  inReplyTo?: string;
  /** RFC 5322 References — the full ancestor chain, used by threading (spec §19). */
  references?: string[];
  subject: string;
  /** Clean, plain-text body — signatures/quoted replies stripped where feasible (spec §21). This is what the AI pipeline reads. */
  bodyText: string;
  /** Raw HTML body, kept only for the evidence viewer's benefit — never sent to the AI pipeline (spec §21). */
  bodyHtml?: string;
  /** A short provider-supplied preview, when available (Gmail's snippet). */
  snippet?: string;
  /** When the sender sent it — may differ from receivedAt (network delay, provider timestamp quirks). */
  sentAt?: Date;
  receivedAt: Date;
  attachments: EmailAttachmentRef[];
  /** Provider labels/folders (Gmail labels, Graph categories) — used for the exclusion filtering in spec §22-23. */
  labels?: string[];
  isRead?: boolean;
  isDraft?: boolean;
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

// ---------------------------------------------------------------------------
// OAuth / connection / sync (Phase 5)
// ---------------------------------------------------------------------------

/**
 * Normalized error codes every provider's failures map onto (spec §13) —
 * the UI branches on `.code`, never a raw provider message or stack
 * trace.
 */
export type EmailProviderErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "MAILBOX_NOT_FOUND"
  | "SYNC_FAILED"
  | "UNKNOWN_PROVIDER_ERROR";

export class EmailProviderError extends Error {
  readonly code: EmailProviderErrorCode;
  readonly cause?: unknown;
  constructor(code: EmailProviderErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "EmailProviderError";
    this.code = code;
    this.cause = cause;
  }
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope?: string;
  /** The provider's own stable account identifier — see EmailAccount.providerAccountId. */
  providerAccountId: string;
  emailAddress: string;
}

export interface ConnectionStatus {
  connected: boolean;
  needsReauth: boolean;
  emailAddress?: string;
  lastSyncedAt?: Date;
  lastSuccessfulSyncAt?: Date;
  error?: string;
}

export interface SyncOptions {
  /** Only for initialSync — how far back to look (spec §16: 30/90/180/365 days). */
  windowDays?: number;
  /** Resume token from a previous page — a Gmail pageToken/historyId or a Graph @odata.nextLink / delta token. */
  cursor?: string;
  pageSize?: number;
}

export interface SyncPage {
  messages: EmailMessage[];
  /** Present when there are more messages to fetch — persist to EmailAccount/EmailProcessingJob so a sync can resume (spec §77). */
  nextCursor?: string;
  hasMore: boolean;
  /** The cursor to persist as the account's steady-state sync position once this page's messages are processed (Gmail historyId / Graph delta link). */
  syncStateCursor?: string;
}

/**
 * Common interface every mailbox source implements — a controlled demo
 * provider today, Gmail/Microsoft Graph for real (spec §5). Nothing in
 * the pipeline (src/lib/pipeline/) imports a concrete provider class
 * directly; it only depends on this interface.
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
  /** Registers push notifications where the provider supports it (Gmail watch / Graph subscriptions) — Phase 5B, see PHASE5_REAL_EMAIL_INTEGRATION.md §50. */
  watch(accountId: string): Promise<WatchHandle>;

  // --- Phase 5: connection lifecycle ---
  /** Revokes/forgets the stored connection for this account (spec §43) — does not delete historical intelligence. */
  disconnect(accountId: string): Promise<void>;
  /** What Settings → Email shows for this account — never exposes a token (spec §82). */
  getConnectionStatus(accountId: string): Promise<ConnectionStatus>;
  /** Refreshes the stored access token from the refresh token; throws EmailProviderError("AUTH_REVOKED"/"AUTH_EXPIRED") if that's no longer possible. */
  refreshAuthentication(accountId: string): Promise<void>;
  /** Normalizes a raw provider exception into an EmailProviderError (spec §13). */
  handleProviderError(error: unknown): EmailProviderError;

  // --- Phase 5: sync ---
  /** The first sync after connecting — bounded to a window, paginated, resumable (spec §16, §76-77). */
  initialSync(accountId: string, options: SyncOptions): Promise<SyncPage>;
  /** Every sync after the first — only new/changed messages via the provider's own incremental mechanism (spec §17). */
  incrementalSync(accountId: string, options: SyncOptions): Promise<SyncPage>;
}

/**
 * The subset of providers that support real OAuth (Gmail, Microsoft
 * Graph) — deliberately not part of the base EmailProvider interface,
 * since DemoEmailProvider has no OAuth concept at all (its one account is
 * pre-seeded, never "connected"). The OAuth routes
 * (src/app/api/email/oauth/[provider]/...) depend on this interface, not
 * on a concrete provider class.
 */
export interface OAuthEmailProvider {
  /** The URL to send the banker's browser to — includes `state` and requests the minimum read-only scope (spec §7-8). */
  getAuthorizationUrl(state: string, redirectUri: string): string;
  /** Exchanges the OAuth callback's `code` for tokens; the caller persists them encrypted (spec §9). */
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokenSet>;
}
