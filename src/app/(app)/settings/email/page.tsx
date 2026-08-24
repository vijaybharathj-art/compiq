import Link from "next/link";
import { CheckCircle2, Info, Mail, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmailAccountCard, type EmailAccountCardData } from "@/components/settings/email-account-card";
import { getPrismaClient } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID } from "@/lib/constants";

// Settings → Email (PHASE5_REAL_EMAIL_INTEGRATION.md §79-83) — real
// connection cards backed by EmailAccount rows, not a "planned" placeholder
// (contrast with /integrations, which is that placeholder and links here).
// Everything shown — status, last synced, sync history — reads live DB
// state; there is no simulated progress on this page.

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined the permission request — no mailbox was connected.",
  missing_code: "The provider didn't return an authorization code. Please try connecting again.",
  state_missing: "The connection attempt expired or the security cookie was missing. Please try again.",
  state_tampered: "The connection attempt could not be verified. Please try again.",
  state_expired: "The connection attempt took too long and expired. Please try again.",
  state_nonce_mismatch: "The connection attempt could not be verified (nonce mismatch). Please try again.",
  state_user_mismatch: "This connection attempt was started by a different signed-in user. Please try again.",
  state_provider_mismatch: "This connection attempt doesn't match the provider you're completing. Please try again.",
  token_exchange_failed: "The provider rejected the authorization code. Please try connecting again.",
  account_already_connected: "This mailbox is already connected to a different Tattava account or organization.",
};

function envConfigured(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]));
}

export default async function SettingsEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const db = getPrismaClient();
  const accounts = await db.emailAccount.findMany({
    // providerAccountId is only ever set by the real OAuth callback
    // (src/app/api/email/oauth/[provider]/callback/route.ts) — it excludes
    // the seeded Demo Mode mailbox (prisma/seed.ts), which exists purely to
    // back /intelligence/scan's "Run Scan" and was never actually
    // connected. Showing that row here as a manageable real connection
    // would be misleading (and clicking "Sync Now" on it would hit the
    // real GmailProvider with no OAuth token to use).
    where: { organizationId: DEMO_ORG_ID, providerAccountId: { not: null } },
    orderBy: { createdAt: "asc" },
    include: {
      syncJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          displayId: true,
          status: true,
          syncType: true,
          messagesFetched: true,
          processedCount: true,
          relevantCount: true,
          startedAt: true,
          finishedAt: true,
          errorMessage: true,
        },
      },
    },
  });

  const cardData: EmailAccountCardData[] = accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    emailAddress: a.emailAddress,
    connectionStatus: a.connectionStatus,
    connectionError: a.connectionError,
    initialSyncCompleted: a.initialSyncCompleted,
    initialSyncWindowDays: a.initialSyncWindowDays,
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: a.lastSuccessfulSyncAt?.toISOString() ?? null,
    recentJobs: a.syncJobs.map((j) => ({
      id: j.id,
      displayId: j.displayId,
      status: j.status,
      syncType: j.syncType,
      messagesFetched: j.messagesFetched,
      processedCount: j.processedCount,
      relevantCount: j.relevantCount,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
      errorMessage: j.errorMessage,
    })),
  }));

  const gmailAccount = cardData.find((a) => a.provider === "GMAIL");
  const outlookAccount = cardData.find((a) => a.provider === "OUTLOOK");

  const gmailConfigured = envConfigured("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  const outlookConfigured = envConfigured("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET");

  return (
    <div className="pb-10">
      <PageHeader title="Email" description="Connect a real mailbox so Tattava can build deal intelligence from it." />

      <div className="flex flex-col gap-4 px-8 pt-5">
        {sp.connected === "1" && (
          <div className="flex items-center gap-2 rounded-md border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">
            <CheckCircle2 className="size-4 shrink-0" />
            Mailbox connected. Run its first sync below to start building intelligence from it.
          </div>
        )}
        {sp.error && (
          <div className="flex items-center gap-2 rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
            <XCircle className="size-4 shrink-0" />
            {OAUTH_ERROR_MESSAGES[sp.error] ?? "Something went wrong connecting your mailbox. Please try again."}
          </div>
        )}

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Info className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">What Tattava does with your mailbox</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1.5 font-medium text-foreground">Tattava will:</p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>Read your inbox to find deal-related correspondence</li>
                <li>Extract deal facts (stage, value, parties, deadlines) with evidence links back to the source email</li>
                <li>Keep a bounded, resumable sync — never an unlimited historical scan</li>
              </ul>
            </div>
            <div>
              <p className="mb-1.5 font-medium text-foreground">Tattava will NOT:</p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>Send email on your behalf, or delete or modify anything in your mailbox</li>
                <li>Access your contacts, calendar, or files</li>
                <li>Download attachment content — Phase 5A stores names and sizes only</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {gmailAccount ? (
            <EmailAccountCard account={gmailAccount} />
          ) : (
            <ConnectCard
              provider="gmail"
              name="Gmail"
              description="Connect a Google Workspace or personal Gmail mailbox (read-only)."
              configured={gmailConfigured}
            />
          )}

          {outlookAccount ? (
            <EmailAccountCard account={outlookAccount} />
          ) : (
            <ConnectCard
              provider="microsoft"
              name="Microsoft Outlook"
              description="Connect a Microsoft 365 mailbox via Microsoft Graph (read-only)."
              configured={outlookConfigured}
            />
          )}
        </div>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Security</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tattava requests read-only mailbox access only — never send, delete, or modify permissions. Access and refresh
            tokens are encrypted at rest and are never exposed to the browser. See{" "}
            <Link href="/audit-log" className="text-accent hover:underline">
              Audit Log
            </Link>{" "}
            for every connect, sync, and disconnect action, and <code className="text-xs">PHASE5_REAL_EMAIL_INTEGRATION.md</code>{" "}
            for the full data-handling policy.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConnectCard({
  provider,
  name,
  description,
  configured,
}: {
  provider: "gmail" | "microsoft";
  name: string;
  description: string;
  configured: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
          <Mail className="size-4 text-muted-foreground" />
        </div>
        <div>
          <CardTitle className="text-sm">{name}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        {configured ? (
          <Badge variant="outline">Not connected</Badge>
        ) : (
          <Badge variant="outline">Not configured — set OAuth credentials in the environment</Badge>
        )}
        {configured ? (
          <Button size="sm" asChild>
            <a href={`/api/email/oauth/${provider}/start`}>Connect</a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            Connect
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
