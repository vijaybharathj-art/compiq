import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailMessage } from "@/lib/email/types";
import type { EmailInput } from "@/lib/ai/types";

// Normalization stage (PHASE3_EMAIL_INTELLIGENCE.md §1/§4). Pure text
// cleanup plus participant resolution — kept separate from classification
// so both can be unit tested independently of the AI provider and the
// database.

const QUOTE_MARKERS = [
  /\n\s*On .{0,80} wrote:\s*$/is,
  /\n\s*-{2,}\s*Original Message\s*-{2,}[\s\S]*$/i,
  /\nFrom:.{0,120}\nSent:.{0,120}\nTo:[\s\S]*$/i,
];

/** Strips trailing quoted-reply chains and collapses whitespace. */
export function normalizeBody(raw: string): string {
  let text = raw;
  for (const marker of QUOTE_MARKERS) {
    const match = text.match(marker);
    if (match && typeof match.index === "number") {
      text = text.slice(0, match.index);
    }
  }
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function buildEmailInput(emailId: string, message: EmailMessage): EmailInput {
  return {
    emailId,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    toAddresses: message.toAddresses,
    ccAddresses: message.ccAddresses,
    subject: message.subject,
    bodyText: normalizeBody(message.bodyText),
    sentAt: message.receivedAt.toISOString(),
  };
}

/**
 * Upserts normalized EmailParticipant rows for one email and resolves each
 * address to a known Contact or internal banker (User) where possible —
 * the signal client/deal matching leans on most heavily (spec §11).
 */
export async function syncParticipants(
  db: PrismaClient,
  emailId: string,
  message: EmailMessage,
): Promise<void> {
  const [contacts, users] = await Promise.all([
    db.contact.findMany({ where: { email: { not: null } }, select: { id: true, email: true } }),
    db.user.findMany({ select: { id: true, email: true } }),
  ]);
  const contactByEmail = new Map(contacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]));
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  const rows: { address: string; name: string | null; role: "FROM" | "TO" | "CC" }[] = [
    { address: message.fromAddress, name: message.fromName ?? null, role: "FROM" },
    ...message.toAddresses.map((a) => ({ address: a, name: null, role: "TO" as const })),
    ...message.ccAddresses.map((a) => ({ address: a, name: null, role: "CC" as const })),
  ];

  await db.emailParticipant.deleteMany({ where: { emailId } });
  await db.emailParticipant.createMany({
    data: rows.map((r) => ({
      emailId,
      address: r.address,
      name: r.name,
      role: r.role,
      contactId: contactByEmail.get(r.address.toLowerCase()) ?? null,
      bankerId: userByEmail.get(r.address.toLowerCase()) ?? null,
    })),
  });
}
