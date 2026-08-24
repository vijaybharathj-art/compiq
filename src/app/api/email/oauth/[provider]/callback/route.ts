import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getOAuthProviderFor } from "@/lib/email";
import { encryptToken } from "@/lib/email/token-crypto";
import { verifyOAuthState, OAUTH_STATE_COOKIE } from "@/lib/email/oauth-state";

// GET /api/email/oauth/[provider]/callback — completes the mailbox-connect
// flow (spec §8-10). Every check below is a named defense from spec §10:
// state validation (CSRF), redirect-uri binding (the same URL used to
// start the flow), provider match, and — the check most OAuth tutorials
// skip — verifying the connecting provider account isn't already attached
// to a *different* Tattava user or organization (account-linking /
// cross-user mailbox attachment, spec §14/§58).

const PROVIDER_MAP = { gmail: "GMAIL", microsoft: "OUTLOOK" } as const;
const EMAIL_PROVIDER_TYPE = { GMAIL: "GMAIL", OUTLOOK: "OUTLOOK" } as const;

function redirectToSettings(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/email", req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));

  const { provider: providerParam } = await params;
  const provider = PROVIDER_MAP[providerParam as keyof typeof PROVIDER_MAP];
  if (!provider) return NextResponse.json({ error: `Unknown email provider "${providerParam}".` }, { status: 404 });

  const searchParams = req.nextUrl.searchParams;
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return redirectToSettings(req, { error: "access_denied", provider: providerParam });
  }

  const code = searchParams.get("code");
  const stateNonce = searchParams.get("state") ?? undefined;
  if (!code) return redirectToSettings(req, { error: "missing_code", provider: providerParam });

  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const stateResult = verifyOAuthState(stateCookie, stateNonce, session.user.id, provider);
  if (!stateResult.ok) {
    return redirectToSettings(req, { error: `state_${stateResult.error.toLowerCase()}`, provider: providerParam });
  }

  const db = getPrismaClient();
  const redirectUri = new URL(`/api/email/oauth/${providerParam}/callback`, req.url).toString();

  let tokens;
  try {
    tokens = await getOAuthProviderFor(provider).exchangeCodeForTokens(code, redirectUri);
  } catch {
    return redirectToSettings(req, { error: "token_exchange_failed", provider: providerParam });
  }

  // Cross-user/cross-org mailbox attachment guard (spec §14, §58): the
  // same real mailbox can only ever belong to the Tattava user/org that
  // first connected it.
  const existing = await db.emailAccount.findFirst({
    where: { provider: EMAIL_PROVIDER_TYPE[provider], providerAccountId: tokens.providerAccountId },
  });
  if (existing && (existing.userId !== session.user.id || existing.organizationId !== DEMO_ORG_ID)) {
    return redirectToSettings(req, { error: "account_already_connected", provider: providerParam });
  }

  const encryptedAccess = encryptToken(tokens.accessToken);
  const encryptedRefresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined;

  const account = existing
    ? await db.emailAccount.update({
        where: { id: existing.id },
        data: {
          accessTokenEncrypted: encryptedAccess,
          ...(encryptedRefresh ? { refreshTokenEncrypted: encryptedRefresh } : {}),
          tokenExpiresAt: tokens.expiresAt,
          scopesGranted: tokens.scope ? tokens.scope.split(/\s+/) : [],
          connectionStatus: "CONNECTED",
          connectionError: null,
        },
      })
    : await db.emailAccount.create({
        data: {
          organizationId: DEMO_ORG_ID,
          userId: session.user.id,
          provider: EMAIL_PROVIDER_TYPE[provider],
          providerAccountId: tokens.providerAccountId,
          emailAddress: tokens.emailAddress,
          accessTokenEncrypted: encryptedAccess,
          refreshTokenEncrypted: encryptedRefresh,
          tokenExpiresAt: tokens.expiresAt,
          scopesGranted: tokens.scope ? tokens.scope.split(/\s+/) : [],
          connectionStatus: "CONNECTED",
        },
      });

  await db.auditLog.create({
    data: {
      organizationId: DEMO_ORG_ID,
      actorUserId: session.user.id,
      action: existing ? "Email account reconnected" : "Email account connected",
      entityType: "EmailAccount",
      entityId: account.id,
      metadata: { provider: providerParam, emailAddress: tokens.emailAddress },
    },
  });

  return redirectToSettings(req, { connected: "1", account: account.id });
}
