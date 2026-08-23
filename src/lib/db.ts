import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter — no bundled query engine
// binary is auto-selected. This client is instantiated lazily and only
// ever imported from server-side code (route handlers, server actions,
// the future prisma-backed repository implementation, and the auth config).
//
// PLANNED INTEGRATION: no live PostgreSQL instance is provisioned in this
// environment yet. Demo Mode (src/lib/data) never calls this module.
// Instantiation is lazy specifically so importing this file — e.g.
// transitively through src/lib/auth/config.ts — never throws just because
// DATABASE_URL is unset; only an actual query would.

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Tattava is running in Demo Mode, which does " +
        "not require a database — this client should not be used outside of " +
        "the (planned) live-data code path.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  return globalThis.__prisma;
}
