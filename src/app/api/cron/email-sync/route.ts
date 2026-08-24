import { NextResponse, type NextRequest } from "next/server";
import { runScheduledSyncs } from "@/lib/email/scheduler";

// GET /api/cron/email-sync — the Vercel Cron target for automatic
// incremental sync (PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §24-25). This
// route must never be publicly executable: Vercel injects an
// `Authorization: Bearer <CRON_SECRET>` header on requests it originates
// for a cron job configured in vercel.json, and this handler rejects
// anything else — a missing header, a wrong secret, or a plain browser
// hit all get the same 401, with the exact reason logged server-side only
// (never in the response body, so a bad guess doesn't confirm anything).
//
// Bounded execution time — Vercel serverless functions have a hard
// duration ceiling regardless of this value; keep it inside the Hobby
// plan's 60s route-level cap so this works before anyone needs to upgrade.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/email-sync] CRON_SECRET is not configured — refusing to run rather than allow an unauthenticated scheduler.");
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    console.warn("[cron/email-sync] Rejected request: missing or invalid Authorization header.");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runScheduledSyncs();
    console.info(
      `[cron/email-sync] eligible=${summary.accountsEligible} synced=${summary.accountsSynced} skipped=${summary.accountsSkipped} failed=${summary.accountsFailed}`,
    );
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/email-sync] Scheduler run failed: ${message}`);
    return NextResponse.json({ error: "Scheduler run failed." }, { status: 500 });
  }
}
