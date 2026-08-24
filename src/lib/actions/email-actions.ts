"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getEmailProviderFor } from "@/lib/email";
import { runAccountSync, type RunAccountSyncResult } from "@/lib/email/sync-engine";

export type { RunAccountSyncResult } from "@/lib/email/sync-engine";

const prisma = getPrismaClient();

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated.");
  return session.user.id;
}

// Every action below re-derives the EmailAccount from the database scoped
// to DEMO_ORG_ID before acting on it — the id a browser form posts back is
// never trusted alone (spec §14, the same rule enforced in
// prisma-repository.ts). A mismatch reads as "not found," not a leak of
// another organization's account.
async function requireOwnedAccount(accountId: string) {
  const account = await prisma.emailAccount.findFirst({ where: { id: accountId, organizationId: DEMO_ORG_ID } });
  if (!account) throw new Error("Email account not found.");
  return account;
}

function revalidateEmailSettings() {
  revalidatePath("/settings/email");
  revalidatePath("/dashboard");
  revalidatePath("/intelligence");
}

/** The "Sync Now" action (spec §26, §76-78) — runs the real, bounded, resumable sync for one connected mailbox. */
export async function syncEmailAccountAction(accountId: string): Promise<RunAccountSyncResult> {
  const userId = await requireUserId();
  await requireOwnedAccount(accountId);
  const result = await runAccountSync(accountId, userId);
  revalidateEmailSettings();
  return result;
}

/** Revokes/forgets the stored connection (spec §43) — historical intelligence already derived from this mailbox is untouched. */
export async function disconnectEmailAccountAction(accountId: string): Promise<void> {
  const userId = await requireUserId();
  const account = await requireOwnedAccount(accountId);

  await getEmailProviderFor(account.provider).disconnect(accountId);

  await prisma.auditLog.create({
    data: {
      organizationId: DEMO_ORG_ID,
      actorUserId: userId,
      action: "Email account disconnected",
      entityType: "EmailAccount",
      entityId: accountId,
      metadata: { provider: account.provider, emailAddress: account.emailAddress },
    },
  });

  revalidateEmailSettings();
}

const ALLOWED_WINDOW_DAYS = [30, 90, 180, 365] as const;

/** Sets how far back the (not-yet-run) initial sync looks (spec §16) — locked once initialSyncCompleted flips true, since changing it after the fact wouldn't retroactively widen what's already been ingested. */
export async function setInitialSyncWindowAction(accountId: string, windowDays: number): Promise<void> {
  await requireUserId();
  const account = await requireOwnedAccount(accountId);
  if (account.initialSyncCompleted) {
    throw new Error("The initial sync has already completed for this mailbox — its window can no longer be changed.");
  }
  if (!ALLOWED_WINDOW_DAYS.includes(windowDays as (typeof ALLOWED_WINDOW_DAYS)[number])) {
    throw new Error(`Invalid sync window: ${windowDays}. Must be one of ${ALLOWED_WINDOW_DAYS.join(", ")}.`);
  }

  await prisma.emailAccount.update({ where: { id: accountId }, data: { initialSyncWindowDays: windowDays } });
  revalidateEmailSettings();
}
