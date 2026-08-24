import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (runtime is always
// nodejs here, which is what NextAuth's JWT decoding needs anyway).
// Gates every route except /login and the NextAuth API routes behind a
// session — see src/lib/auth/config.ts for the demo Credentials provider
// this enforces.

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = Boolean(req.auth);
  const isPublicRoute = pathname.startsWith("/login") || pathname.startsWith("/api/auth");

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
