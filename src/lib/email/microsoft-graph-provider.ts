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

// Real MicrosoftGraphProvider — Microsoft Graph v1.0 (spec §11-12,
// §17-18). Same caveat as gmail-provider.ts: built and typed against the
// real Graph API surface, never executed against a live mailbox here —
// no outbound network access, no registered Entra app in this
// environment. See PHASE5_REAL_EMAIL_INTEGRATION.md.
//
// Scope requested: Mail.Read + offline_access ONLY (spec §12) — no send,
// no modify, no delete. Graph returns message bodies as structured JSON
// (HTML or text, per body.contentType), so unlike Gmail this provider
// needs no MIME/base64 decoding.

export const MICROSOFT_SCOPES = "offline_access Mail.Read";

function tenantId(): string {
  return process.env.MICROSOFT_TENANT_ID ?? "common";
}
function authUrl(): string {
  return `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/authorize`;
}
function tokenUrl(): string {
  return `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/token`;
}
const API_BASE = "https://graph.microsoft.com/v1.0/me";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — required for Microsoft OAuth. See .env.example.`);
  return value;
}

async function fetchWithRetry(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const delay = retryAfterHeader ? Number(retryAfterHeader) * 1000 : BASE_BACKOFF_MS * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchWithRetry(url, init, attempt + 1);
  }
  return res;
}

function mapHttpError(status: number, body: string): EmailProviderError {
  if (status === 401) return new EmailProviderError("AUTH_EXPIRED", "Microsoft Graph access token expired or invalid.", body);
  if (status === 403) return new EmailProviderError("PERMISSION_DENIED", "Microsoft Graph denied the request — permission may have been revoked.", body);
  if (status === 404 || status === 410) return new EmailProviderError("MAILBOX_NOT_FOUND", "Microsoft Graph mailbox, message, or delta link not found/expired.", body);
  if (status === 429) return new EmailProviderError("RATE_LIMITED", "Microsoft Graph throttled this request.", body);
  if (status >= 500) return new EmailProviderError("PROVIDER_UNAVAILABLE", "Microsoft Graph is temporarily unavailable.", body);
  return new EmailProviderError("UNKNOWN_PROVIDER_ERROR", `Microsoft Graph error (HTTP ${status}).`, body);
}

// --- Graph message shape --------------------------------------------------

interface GraphRecipient {
  emailAddress: { name?: string; address: string };
}
interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}
interface GraphMessage {
  id: string;
  conversationId: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: "text" | "html"; content: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  replyTo?: GraphRecipient[];
  sentDateTime?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  attachments?: GraphAttachment[];
  internetMessageHeaders?: { name: string; value: string }[];
}

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

function headerValue(headers: { name: string; value: string }[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Normalizes one Graph message into Tattava's provider-independent EmailMessage (spec §6). Attachment content is never fetched — metadata only (spec §20), and $expand=attachments is used for names/sizes without a second request per message. */
function normalizeGraphMessage(raw: GraphMessage): EmailMessage {
  const rawBody = raw.body?.content ?? raw.bodyPreview ?? "";
  const bodyText = stripQuotedAndSignature(raw.body?.contentType === "html" ? htmlToText(rawBody) : rawBody);
  const bodyHtml = raw.body?.contentType === "html" ? rawBody : undefined;
  const references = headerValue(raw.internetMessageHeaders, "References");
  const inReplyTo = headerValue(raw.internetMessageHeaders, "In-Reply-To");

  return {
    id: raw.id,
    providerMessageId: raw.id,
    providerThreadId: raw.conversationId,
    internetMessageId: raw.internetMessageId,
    fromAddress: raw.from?.emailAddress.address ?? "",
    fromName: raw.from?.emailAddress.name,
    toAddresses: (raw.toRecipients ?? []).map((r) => r.emailAddress.address),
    ccAddresses: (raw.ccRecipients ?? []).map((r) => r.emailAddress.address),
    bccAddresses: (raw.bccRecipients ?? []).map((r) => r.emailAddress.address),
    replyTo: raw.replyTo?.[0]?.emailAddress.address,
    inReplyTo,
    references: references ? references.split(/\s+/).filter(Boolean) : undefined,
    subject: raw.subject ?? "(no subject)",
    bodyText,
    bodyHtml,
    snippet: raw.bodyPreview,
    sentAt: raw.sentDateTime ? new Date(raw.sentDateTime) : undefined,
    receivedAt: raw.receivedDateTime ? new Date(raw.receivedDateTime) : new Date(),
    attachments: (raw.attachments ?? []).map((a) => ({ id: a.id, filename: a.name, mimeType: a.contentType, sizeBytes: a.size })),
    isRead: raw.isRead,
    isDraft: raw.isDraft,
  };
}

const db = getPrismaClient();

async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (!account.accessTokenEncrypted) {
    throw new EmailProviderError("AUTH_REQUIRED", "This Microsoft 365 account has never completed authorization.");
  }
  const expiresAt = account.tokenExpiresAt;
  if (expiresAt && expiresAt.getTime() - Date.now() < 60_000) {
    await new MicrosoftGraphProvider().refreshAuthentication(accountId);
    const refreshed = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    return decryptToken(refreshed.accessTokenEncrypted!);
  }
  return decryptToken(account.accessTokenEncrypted);
}

const MESSAGE_SELECT =
  "id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,replyTo,sentDateTime,receivedDateTime,isRead,isDraft,hasAttachments";

async function graphFetch(accountId: string, urlOrPath: string, query?: Record<string, string>): Promise<unknown> {
  const accessToken = await getValidAccessToken(accountId);
  const url = urlOrPath.startsWith("https://") ? new URL(urlOrPath) : new URL(`${API_BASE}${urlOrPath}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  const res = await fetchWithRetry(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw mapHttpError(res.status, await res.text());
  return res.json();
}

async function withAttachments(accountId: string, message: GraphMessage): Promise<GraphMessage> {
  if (!message.hasAttachments) return message;
  const attachments = (await graphFetch(accountId, `/messages/${message.id}/attachments`, {
    $select: "id,name,contentType,size",
  })) as { value: GraphAttachment[] };
  return { ...message, attachments: attachments.value };
}

export class MicrosoftGraphProvider implements EmailProvider, OAuthEmailProvider {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: requireEnv("MICROSOFT_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: MICROSOFT_SCOPES,
      response_mode: "query",
      state,
    });
    return `${authUrl()}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const res = await fetchWithRetry(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: requireEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES,
      }),
    });
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

    const profileRes = await fetchWithRetry(`${API_BASE}?$select=id,mail,userPrincipalName`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileRes.ok) throw mapHttpError(profileRes.status, await profileRes.text());
    const profile = (await profileRes.json()) as { id: string; mail?: string; userPrincipalName: string };

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      providerAccountId: profile.id,
      emailAddress: profile.mail ?? profile.userPrincipalName,
    };
  }

  async refreshAuthentication(accountId: string): Promise<void> {
    const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (!account.refreshTokenEncrypted) {
      await db.emailAccount.update({ where: { id: accountId }, data: { connectionStatus: "NEEDS_REAUTH", connectionError: "No refresh token stored — reconnect required." } });
      throw new EmailProviderError("AUTH_REVOKED", "No refresh token available; the user must reconnect.");
    }
    const refreshToken = decryptToken(account.refreshTokenEncrypted);
    const res = await fetchWithRetry(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: requireEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      await db.emailAccount.update({ where: { id: accountId }, data: { connectionStatus: "NEEDS_REAUTH", connectionError: "Microsoft rejected the refresh token — permission may have been revoked." } });
      throw res.status === 400 || res.status === 401
        ? new EmailProviderError("AUTH_REVOKED", "Refresh token rejected — reconnect required.", errorBody)
        : mapHttpError(res.status, errorBody);
    }
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    await db.emailAccount.update({
      where: { id: accountId },
      data: {
        accessTokenEncrypted: encryptToken(tokens.access_token),
        // Microsoft rotates refresh tokens on use — persist the new one when issued.
        ...(tokens.refresh_token ? { refreshTokenEncrypted: encryptToken(tokens.refresh_token) } : {}),
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
    return new EmailProviderError("UNKNOWN_PROVIDER_ERROR", "Unexpected Microsoft Graph provider error.", error);
  }

  /**
   * Bounded to a configurable window (spec §16), paginated via
   * @odata.nextLink (spec §76), resumable (spec §77). Scoped to the Inbox
   * folder specifically — Graph's exclusion strategy is folder-based
   * rather than Gmail's query operators (spec §22): Sent Items, Drafts,
   * Deleted Items, and Junk Email are separate folders this never queries.
   */
  async initialSync(accountId: string, options: SyncOptions): Promise<SyncPage> {
    const windowDays = options.windowDays ?? 90;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const path = options.cursor ?? `/mailFolders/inbox/messages`;
    const result = (await graphFetch(accountId, path, options.cursor ? {} : {
      $select: MESSAGE_SELECT,
      $filter: `receivedDateTime ge ${since} and isDraft eq false`,
      $orderby: "receivedDateTime asc",
      $top: String(options.pageSize ?? 25),
    })) as { value: GraphMessage[]; "@odata.nextLink"?: string };

    const messages: EmailMessage[] = [];
    for (const raw of result.value) {
      messages.push(normalizeGraphMessage(await withAttachments(accountId, raw)));
    }

    const page: SyncPage = { messages, hasMore: Boolean(result["@odata.nextLink"]), nextCursor: result["@odata.nextLink"] };
    if (!page.hasMore) {
      const delta = (await graphFetch(accountId, `/mailFolders/inbox/messages/delta`, { $select: "id" })) as { "@odata.deltaLink"?: string };
      page.syncStateCursor = delta["@odata.deltaLink"];
    }
    return page;
  }

  /** Graph delta query (spec §17) — only messages added/changed since the stored delta link. */
  async incrementalSync(accountId: string, options: SyncOptions): Promise<SyncPage> {
    if (!options.cursor) {
      return this.initialSync(accountId, { windowDays: 7, pageSize: options.pageSize });
    }
    try {
      const result = (await graphFetch(accountId, options.cursor, {})) as {
        value: GraphMessage[];
        "@odata.nextLink"?: string;
        "@odata.deltaLink"?: string;
      };
      const messages: EmailMessage[] = [];
      for (const raw of result.value) {
        if (raw.isDraft) continue;
        messages.push(normalizeGraphMessage(await withAttachments(accountId, raw)));
      }
      return {
        messages,
        hasMore: Boolean(result["@odata.nextLink"]),
        nextCursor: result["@odata.nextLink"],
        syncStateCursor: result["@odata.deltaLink"] ?? options.cursor,
      };
    } catch (error) {
      if (error instanceof EmailProviderError && error.code === "MAILBOX_NOT_FOUND") {
        // Graph returns 410 Gone for an expired delta link — the documented signal to fall back to a bounded re-sync.
        return this.initialSync(accountId, { windowDays: 7, pageSize: options.pageSize });
      }
      throw error;
    }
  }

  async getThreads(accountId: string, since?: Date): Promise<EmailThreadSummary[]> {
    const filter = since ? { $filter: `receivedDateTime ge ${since.toISOString()} and isDraft eq false` } : { $filter: "isDraft eq false" };
    const result = (await graphFetch(accountId, "/mailFolders/inbox/messages", {
      $select: MESSAGE_SELECT,
      $orderby: "receivedDateTime desc",
      $top: "50",
      ...filter,
    })) as { value: GraphMessage[] };

    const byThread = new Map<string, GraphMessage[]>();
    for (const m of result.value) {
      if (!byThread.has(m.conversationId)) byThread.set(m.conversationId, []);
      byThread.get(m.conversationId)!.push(m);
    }
    return Array.from(byThread.entries()).map(([threadId, msgs]) => {
      const last = msgs[0]!;
      return {
        providerThreadId: threadId,
        subject: last.subject ?? "",
        participantSummary: [...new Set(msgs.map((m) => m.from?.emailAddress.name ?? m.from?.emailAddress.address ?? ""))].join(", "),
        lastMessageAt: last.receivedDateTime ? new Date(last.receivedDateTime) : new Date(),
      };
    });
  }

  async getThread(accountId: string, providerThreadId: string): Promise<EmailThreadDetail> {
    const result = (await graphFetch(accountId, "/messages", {
      $select: MESSAGE_SELECT,
      $filter: `conversationId eq '${providerThreadId}'`,
      $orderby: "receivedDateTime asc",
    })) as { value: GraphMessage[] };
    const messages: EmailMessage[] = [];
    for (const raw of result.value) messages.push(normalizeGraphMessage(await withAttachments(accountId, raw)));
    const last = messages[messages.length - 1];
    return {
      providerThreadId,
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
    const raw = (await graphFetch(accountId, `/messages/${providerMessageId}`, { $select: MESSAGE_SELECT })) as GraphMessage;
    return normalizeGraphMessage(await withAttachments(accountId, raw));
  }

  async getNewMessages(accountId: string, since?: Date): Promise<EmailMessage[]> {
    const page = since ? await this.incrementalSync(accountId, { cursor: undefined }) : await this.initialSync(accountId, { windowDays: 90 });
    return page.messages;
  }

  async getAttachments(accountId: string, providerMessageId: string): Promise<EmailAttachmentRef[]> {
    const result = (await graphFetch(accountId, `/messages/${providerMessageId}/attachments`, { $select: "id,name,contentType,size" })) as { value: GraphAttachment[] };
    return result.value.map((a) => ({ id: a.id, filename: a.name, mimeType: a.contentType, sizeBytes: a.size }));
  }

  async downloadAttachment(): Promise<Buffer> {
    throw new EmailProviderError("UNKNOWN_PROVIDER_ERROR", "Attachment content download is not implemented — Phase 5A stores metadata only.");
  }

  async markProcessed(): Promise<void> {
    // Same rationale as GmailProvider — Tattava's own Email.processingStatus is authoritative.
  }

  async watch(accountId: string): Promise<WatchHandle> {
    // Graph change notifications (webhooks) are Phase 5B (spec §50).
    throw new EmailProviderError("UNKNOWN_PROVIDER_ERROR", `Microsoft Graph webhooks are a Phase 5B feature, not yet implemented (accountId=${accountId}).`);
  }
}
