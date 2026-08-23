import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { getPrismaClient } from "@/lib/db";

// PLANNED INTEGRATION — see SECURITY.md §1 and ARCHITECTURE.md §2.
//
// Google + Microsoft Entra ID OAuth via Auth.js (NextAuth v5). Tattava never
// requests or stores a mailbox password; these are the only two sign-in
// methods. Demo Mode does not require authentication, so nothing in the
// active (app) route group imports this module or gates on `auth()` — it
// exists as a complete, reviewable scaffold for the live-data build, wired
// up the moment DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, and
// MICROSOFT_CLIENT_ID/SECRET are configured.
//
// The adapter is constructed lazily and only when DATABASE_URL is present
// so that merely importing this file in Demo Mode never throws.

const hasDatabase = Boolean(process.env.DATABASE_URL);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasDatabase ? PrismaAdapter(getPrismaClient()) : undefined,
  session: { strategy: hasDatabase ? "database" : "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? "common"}/v2.0`,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Attaches the active OrganizationMember role/team to the session so
    // RBAC checks (SECURITY.md §2) don't need a fresh DB round trip on
    // every request. Populated once org membership lookups are wired up.
    async session({ session }) {
      return session;
    },
  },
});
