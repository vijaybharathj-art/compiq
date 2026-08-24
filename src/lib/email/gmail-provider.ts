import { getPrismaClient } from "@/lib/db";
import { encryptToken, decryptToken } from "./token-crypto";
import { EmailProviderError } from "./types";
import type {
  ConnectionStatus,
  EmailAttachmentRef,
  EmailMessage,
  EmailProvider,
  EmailThreadDetail,
  EmailThreadSummary,
  OAuthEmailProvider,
  OAuthTokenSet,
  SyncOptions,
  SyncPage,
  WatchHandle,
} from "./types";

// Real GmailProvider — Gmail REST API v1 (spec §7-10, §17-18).
//
// Built and typed against the real Gmail API surface, but never
// executed against a live mailbox in this environment — there is no
// outbound network access and no registered Google Cloud OAuth client
// here. See PHASE5_REAL_EMAIL_INTEGRATION.md for exactly what that
// means and what a human owner needs to do to actually exercise it.
//
// Deliberately uses raw fetch() against the documented REST endpoints
// rather than the `googleapis` SDK — one fewer heavy dependency, and the
// exact request/response shape stays visible in this file rather than
// behind a generated client.
//
// Scope requested: gmail.readonly ONLY (spec §7) — Tattava never sends,
// modifies, or deletes mail.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — required for Gmail OAuth. See .env.example.`);
  return value;
}

async function fetchWithRetry(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    const delay = BASE_BACKOFF_MS * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchWithRetry(url, init, attempt + 1);
  }
  return res;
}

function mapHttpError(status: number, body: string): EmailProviderError {
  if (status === 401) return new EmailProviderError("AUTH_EXPIRED", "Gmail access token expired or invalid.", body);
  if (status === 403) return new EmailProviderError("PERMISSION_DENIED", "Gmail denied the request — permission may have been revoked.", body);
  if (status === 404) return new EmailProviderError("MAILBOX_NOT_FOUND", "Gmail mailbox or message not found.", body);
  if (status === 429) return new EmailProviderError("RATE_LIMITED", "Gmail API rate limit exceeded.", body);
  if (status >= 500) return new EmailProviderError("PROVIDER_UNAVAILABLE", "Gmail API is temporarily unavailable.", body);
  return new EmailProviderError("UNKNOWN_PROVIDER_ERROR", `Gmail API error (HTTP ${status}).`, body);
}

// --- MIME decoding -----------------------------------------------------

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
  filename?: string;
}
interface GmailApiMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload: GmailPart;
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function header(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

// Strips a common signature-block / quoted-reply tail from plain text
// (spec §21) — a best-effort heuristic (a line of dashes, "On ... wrote:",
// or a run of ">" quoted lines), not a full email-parsing library. Never
// aggressive enough to risk cutting genuine deal content; when in doubt it
// keeps the text.
function stripQuotedAndSignature(text: string): string {
  const patterns = [/^-- $/m, /^On .+ wrote:$/m, /^From: .+$/m, /^-{2,}\s*Original Message\s*-{2,}$/im];
  let cut = text.length;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut).trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findParts(part: GmailPart, mimeType: string): GmailPart[] {
  const matches: GmailPart[] = [];
  if (part.mimeType === mimeType) matches.push(part);
  for (const child of part.parts ?? []) matches.push(...findParts(child, mimeType));
  return matches;
}

function extractAttachments(part: GmailPart, out: EmailAttachmentRef[] = []): EmailAttachmentRef[] {
  if (part.filename && part.body?.attachmentId) {
    out.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      sizeBytes: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) extractAttachments(child, out);
  return out;
}

function parseAddressList(value: string | undefined): string[] {
  if (!value) return [];
  // Good-enough splitting for "Name <a@b.com>, Name2 <c@d.com>" — real
  // RFC 5322 address parsing (quoted display names containing commas) is
  // out of scope; deal correspondence practically never uses that.
  return value
    .split(",")
    .map((entry) => {
      const match = entry.match(/<([^>]+)>/);
      return (match ? match[1] : entry).trim();
    })
    .filter(Boolean);
}

/** Normalizes one Gmail API message into Tattava's provider-independent EmailMessage (spec §6). Attachment content is never fetched — metadata only (spec §20). */
function normalizeGmailMessage(raw: GmailApiMessage): EmailMessage {
  const headers = raw.payload.headers;
  const textParts = findParts(raw.payload, "text/plain");
  const htmlParts = findParts(raw.payload, "text/html");

  let bodyText = "";
  if (textParts.length > 0 && textParts[0]!.body?.data) {
    bodyText = stripQuotedAndSignature(base64UrlDecode(textParts[0]!.body.data));
  } else if (htmlParts.length > 0 && htmlParts[0]!.body?.data) {
    bodyText = stripQuotedAndSignature(htmlToText(base64UrlDecode(htmlParts[0]!.body.data)));
  } else if (raw.payload.body?.data) {
    bodyText = stripQuotedAndSignature(base64UrlDecode(raw.payload.body.data));
  }
  const bodyHtml = htmlParts[0]?.body?.data ? base64UrlDecode(htmlParts[0]!.body.data) : undefined;

  const fromRaw = header(headers, "From") ?? "";
  const fromMatch = fromRaw.match(/^(.*?)\s*<([^>]+)>$/);
  const fromName = fromMatch?.[1]?.replace(/^"|"$/g, "").trim() || undefined;
  const fromAddress = fromMatch ? fromMatch[2]! : fromRaw;

  const referencesHeader = header(headers, "References");

  return {
    id: raw.id,
    providerMessageId: raw.id,
    providerThreadId: raw.threadId,
    internetMessageId: header(headers, "Message-ID"),
    fromAddress,
    fromName,
    toAddresses: parseAddressList(header(headers, "To")),
    ccAddresses: parseAddressList(header(headers, "Cc")),
    bccAddresses: parseAddressList(header(headers, "Bcc")),
    replyTo: header(headers, "Reply-To"),
    inReplyTo: header(headers, "In-Reply-To"),
    references: referencesHeader ? referencesHeader.split(/\s+/).filter(Boolean) : undefined,
    subject: header(headers, "Subject") ?? "(no subject)",
    bodyText,
    bodyHtml,
    snippet: raw.snippet,
    sentAt: header(headers, "Date") ? new Date(header(headers, "Date")!) : undefined,
    receivedAt: raw.internalDate ? new Date(Number(raw.internalDate)) : new Date(),
    attachments: extractAttachments(raw.payload),
    labels: raw.labelIds,
    isRead: raw.labelIds ? !raw.labelIds.includes("UNREAD") : undefined,
    isDraft: raw.labelIds ? raw.labelIds.includes("DRAFT") : undefined,
  };
}

// --- Token persistence ---------------------------------------------------

const db = getPrismaClient();

async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (!account.accessTokenEncrypted) {
    throw new EmailProviderError("AUTH_REQUIRED", "This Gmail account has never completed authorization.");
  }
  const expiresAt = account.tokenExpiresAt;
  if (expiresAt && expiresAt.getTime() - Date.now() < 60_000) {
    await new GmailProvider().refreshAuthentication(accountId);
    const refreshed = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    return decryptToken(refreshed.accessTokenEncrypted!);
  }
  return decryptToken(account.accessTokenEncrypted);
}

async function gmailFetch(accountId: string, path: string, query?: Record<string, string>): Promise<unknown> {
  const accessToken = await getValidAccessToken(accountId);
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  const res = await fetchWithRetry(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    throw mapHttpError(res.status, body);
  }
  return res.json();
}

// Banking-relevant exclusion filtering (spec §22-23) — applied at the
// Gmail query level via `q=` where possible (cheaper than fetching then
// discarding), covering the categories spec §22 names explicitly. Genuine
// banking correspondence is never excluded by label alone.
const EXCLUDED_GMAIL_QUERY = "-in:spam -in:trash -in:chats -category:promotions -category:social -category:forums";

export class GmailProvider implements EmailProvider, OAuthEmailProvider {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const res = await fetchWithRetry(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

    const profileRes = await fetchWithRetry(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileRes.ok) throw mapHttpError(profileRes.status, await profileRes.text());
    const profile = (await profileRes.json()) as { emailAddress: string };

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      providerAccountId: profile.emailAddress,
      emailAddress: profile.emailAddress,
    };
  }

  async refreshAuthentication(accountId: string): Promise<void> {
    const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (!account.refreshTokenEncrypted) {
      await db.emailAccount.update({ where: { id: accountId }, data: { connectionStatus: "NEEDS_REAUTH", connectionError: "No refresh token stored — reconnect required." } });
      throw new EmailProviderError("AUTH_REVOKED", "No refresh token available; the user must reconnect.");
    }
    const refreshToken = decryptToken(account.refreshTokenEncrypted);
    const res = await fetchWithRetry(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      await db.emailAccount.update({ where: { id: accountId }, data: { connectionStatus: "NEEDS_REAUTH", connectionError: "Google rejected the refresh token — permission may have been revoked." } });
      throw res.status === 400 || res.status === 401
        ? new EmailProviderError("AUTH_REVOKED", "Refresh token rejected — reconnect required.", errorBody)
        : mapHttpError(res.status, errorBody);
    }
    const tokens = (await res.json()) as { access_token: string; expires_in: number };
    await db.emailAccount.update({
      where: { id: accountId },
      data: {
        accessTokenEncrypted: encryptToken(tokens.access_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        connectionStatus: "CONNECTED",
        connectionError: null,
      },
    });
  }

  async disconnect(accountId: string): Promise<void> {
    await db.emailAccount.update({
      where: { id: accountId },
      data: { connectionStatus: "DISCONNECTED", accessTokenEncrypted: null, refreshTokenEncrypted: null, tokenExpiresAt: null },
    });
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

  handleProviderError(error: unknown): EmailProviderError {
    if (error instanceof EmailProviderError) return error;
    return new EmailProviderError("UNKNOWN_PROVIDER_ERROR", "Unexpected Gmail provider error.", error);
  }

  private async listAndFetch(accountId: string, query: string, pageToken: string | undefined, pageSize: number): Promise<SyncPage> {
    const list = (await gmailFetch(accountId, "/messages", {
      q: query,
      maxResults: String(pageSize),
      ...(pageToken ? { pageToken } : {}),
    })) as { messages?: { id: string }[]; nextPageToken?: string };

    const messages: EmailMessage[] = [];
    for (const ref of list.messages ?? []) {
      const full = (await gmailFetch(accountId, `/messages/${ref.id}`, { format: "full" })) as GmailApiMessage;
      messages.push(normalizeGmailMessage(full));
    }

    return { messages, hasMore: Boolean(list.nextPageToken), nextCursor: list.nextPageToken };
  }

  /** Bounded to a configurable window (spec §16), paginated (spec §76), resumable via nextCursor (spec §77). */
  async initialSync(accountId: string, options: SyncOptions): Promise<SyncPage> {
    const windowDays = options.windowDays ?? 90;
    const after = Math.floor((Date.now() - windowDays * 24 * 60 * 60 * 1000) / 1000);
    const query = `${EXCLUDED_GMAIL_QUERY} after:${after}`;
    const page = await this.listAndFetch(accountId, query, options.cursor, options.pageSize ?? 25);
    if (!page.hasMore) {
      const profile = (await gmailFetch(accountId, "/profile", {})) as { historyId: string };
      page.syncStateCursor = profile.historyId;
    }
    return page;
  }

  /** Gmail's history API (spec §17) — only messages added/changed since the stored historyId. Falls back to a bounded re-list if the historyId has expired (Gmail retains history for ~7-30 days). */
  async incrementalSync(accountId: string, options: SyncOptions): Promise<SyncPage> {
    if (!options.cursor) {
      return this.initialSync(accountId, { windowDays: 7, pageSize: options.pageSize });
    }
    try {
      const history = (await gmailFetch(accountId, "/history", {
        startHistoryId: options.cursor,
        historyTypes: "messageAdded",
        maxResults: String(options.pageSize ?? 50),
      })) as { history?: { messagesAdded?: { message: { id: string } }[] }[]; nextPageToken?: string; historyId?: string };

      const ids = new Set<string>();
      for (const entry of history.history ?? []) {
        for (const added of entry.messagesAdded ?? []) ids.add(added.message.id);
      }
      const messages: EmailMessage[] = [];
      for (const id of ids) {
        const full = (await gmailFetch(accountId, `/messages/${id}`, { format: "full" })) as GmailApiMessage;
        messages.push(normalizeGmailMessage(full));
      }
      return {
        messages,
        hasMore: Boolean(history.nextPageToken),
        nextCursor: history.nextPageToken,
        syncStateCursor: history.historyId ?? options.cursor,
      };
    } catch (error) {
      if (error instanceof EmailProviderError && error.code === "MAILBOX_NOT_FOUND") {
        // Gmail returns 404 for an expired/unknown historyId — the documented signal to fall back to a bounded re-sync.
        return this.initialSync(accountId, { windowDays: 7, pageSize: options.pageSize });
      }
      throw error;
    }
  }

  async getThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    const query = since ? `${EXCLUDED_GMAIL_QUERY} after:${Math.floor(since.getTime() / 1000)}` : EXCLUDED_GMAIL_QUERY;
    const list = (await gmailFetch(accountId, "/threads", { q: query, maxResults: "50" })) as { threads?: { id: string; snippet?: string }[] };
    const summaries: EmailThreadSummary[] = [];
    for (const t of list.threads ?? []) {
      const detail = await this.getThread(accountId, t.id);
      summaries.push(detail);
    }
    return summaries;
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    const thread = (await gmailFetch(accountId, `/threads/${providerThreadId}`, { format: "full" })) as { id: string; messages: GmailApiMessage[] };
    const messages = thread.messages.map(normalizeGmailMessage);
    const last = messages[messages.length - 1];
    return {
      providerThreadId: thread.id,
      subject: last?.subject ?? "",
      participantSummary: [...new Set(messages.map((m) => m.fromName ?? m.fromAddress))].join(", "),
      lastMessageAt: last?.receivedAt ?? new Date(),
      messages,
    };
  }

  async getMessages(accountId: string, providerThreadId: string): Promise<EmailMessage[]> {
    const thread = await this.getThread(accountId, providerThreadId);
    return thread.messages;
  }

  async getMessage(accountId: string, providerMessageId: string): Promise<EmailMessage> {
    const raw = (await gmailFetch(accountId, `/messages/${providerMessageId}`, { format: "full" })) as GmailApiMessage;
    return normalizeGmailMessage(raw);
  }

  async getNewMessages(accountId: string, since?: Date): Promise<EmailMessage[]> {
    const page = await (since ? this.incrementalSync(accountId, { cursor: undefined, windowDays: undefined }) : this.initialSync(accountId, { windowDays: 90 }));
    return page.messages;
  }

  async getAttachments(accountId: string, providerMessageId: string): Promise<EmailAttachmentRef[]> {
    const raw = (await gmailFetch(accountId, `/messages/${providerMessageId}`, { format: "full" })) as GmailApiMessage;
    return extractAttachments(raw.payload);
  }

  async downloadAttachment(): Promise<Buffer> {
    // Phase 5A deliberately never downloads attachment content (spec §20)
    // — metadata only. Full attachment intelligence is a future phase.
    throw new EmailProviderError("UNKNOWN_PROVIDER_ERROR", "Attachment content download is not implemented — Phase 5A stores metadata only.");
  }

  async markProcessed(): Promise<void> {
    // Gmail has no "processed by a third party" concept to write back to
    // — Tattava's own Email.processingStatus (set by the pipeline) is the
    // source of truth for what's been ingested. Intentionally a no-op.
  }

  async watch(accountId: string): Promise<WatchHandle> {
    // Gmail push notifications (watch/stop via Pub/Sub) are Phase 5B (spec
    // §50) — Phase 5A is manual + polled incremental sync only.
    throw new EmailProviderError("UNKNOWN_PROVIDER_ERROR", `Gmail push notifications are a Phase 5B feature, not yet implemented (accountId=${accountId}).`);
  }
}
