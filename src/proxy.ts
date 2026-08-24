import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (runtime is always
// nodejs here, which is what NextAuth's JWT decoding needs anyway).
// Gates every route except /login and the NextAuth API routes behind a
// session — see src/lib/auth/config.ts for the demo Credentials provider
// this enforces.
//
// /api/cron is the one deliberate exception beyond that (Phase 5B —
// PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §25): Vercel Cron calls
// /api/cron/email-sync with no user session at all, ever — it authenticates
// itself via a CRON_SECRET bearer token the route handler checks directly
// (src/app/api/cron/email-sync/route.ts), the same "public route,
// self-authenticates differently" shape as /api/auth. Without this
// exclusion, every cron invocation would 307-redirect to /login instead of
// running — a real bug caught by actually curling the route rather than
// assuming the session gate wouldn't apply to it.

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = Boolean(req.auth);
  const isPublicRoute = pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/cron");

  if (!isAuthed && !isPublicRoute) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthed && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|favicon.ico).*)"],
};
