import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { getPrismaClient } from "@/lib/db";

// Google + Microsoft Entra ID OAuth are PLANNED INTEGRATION — see
// SECURITY.md §1 and ARCHITECTURE.md §2. Tattava never requests or stores a
// mailbox password; those two are the only sign-in methods intended for
// production.
//
// For Phase 1 (this MVP), "Authentication" is a lightweight Credentials
// provider that lets you pick which seeded banker to continue as — a demo
// login, not a real credential exchange. It is clearly a placeholder: no
// password is collected or checked, `authorize` simply looks up the
// selected user by id. It exists so the product has a real
// Authentication -> Dashboard flow without building OAuth infrastructure
// that item 31 of the execution brief explicitly defers.

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "demo",
      name: "Demo account",
      credentials: { userId: { label: "User", type: "text" } },
      async authorize(credentials) {
        const userId = credentials?.userId;
        if (typeof userId !== "string" || !userId) return null;
        const prisma = getPrismaClient();
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
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
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
