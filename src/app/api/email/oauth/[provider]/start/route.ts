import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getOAuthProviderFor } from "@/lib/email";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/email/oauth-state";

// GET /api/email/oauth/[provider]/start — begins the mailbox-connect
// OAuth flow (spec §8, §11). Deliberately a separate flow from NextAuth's
// own Google/Microsoft sign-in providers (src/lib/auth/config.ts) — those
// authenticate *identity*, this authorizes *mailbox read access*, with a
// different scope and its own long-lived token storage (EmailAccount),
// not a session.

const PROVIDER_MAP = { gmail: "GMAIL", microsoft: "OUTLOOK" } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { provider: providerParam } = await params;
  const provider = PROVIDER_MAP[providerParam as keyof typeof PROVIDER_MAP];
  if (!provider) {
    return NextResponse.json({ error: `Unknown email provider "${providerParam}".` }, { status: 404 });
  }

  const { nonce, cookieValue } = createOAuthState(session.user.id, DEMO_ORG_ID, provider);
  const redirectUri = new URL(`/api/email/oauth/${providerParam}/callback`, req.url).toString();
  const authorizationUrl = getOAuthProviderFor(provider).getAuthorizationUrl(nonce, redirectUri);

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
