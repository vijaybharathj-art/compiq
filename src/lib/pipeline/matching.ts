import type { PrismaClient } from "@/generated/prisma/client";
import type { AIProvider, DealCandidate, DealMatchResult } from "@/lib/ai/types";
import type { ExtractionResult } from "@/lib/ai/extraction-schema";

// Client matching + deal matching stages (spec §11-13). Two separate
// exported functions, run in sequence by the orchestrator — client
// matching narrows the candidate deal set; deal matching combines the
// AIProvider's signal with a deterministic thread-continuity override so
// an email in a thread already linked to a deal never gets reassigned by
// a lower-confidence AI guess.

export async function matchClient(
  db: PrismaClient,
  organizationId: string,
  extraction: ExtractionResult,
  participantContactIds: string[],
): Promise<string | null> {
  if (extraction.clientName) {
    const byName = await db.client.findFirst({
      where: { organizationId, name: { equals: extraction.clientName, mode: "insensitive" } },
    });
    if (byName) return byName.id;
  }

  if (participantContactIds.length > 0) {
    const contact = await db.contact.findFirst({
      where: { id: { in: participantContactIds } },
      select: { clientId: true },
    });
    if (contact) return contact.clientId;
  }

  return null;
}

async function loadCandidateDeals(
  db: PrismaClient,
  organizationId: string,
  clientId: string | null,
): Promise<DealCandidate[]> {
  const deals = await db.deal.findMany({
    where: { organizationId, ...(clientId ? { clientId } : {}) },
    include: { client: true, bankingService: true, currentStage: true },
    // Unscoped (clientId null) matching stays bounded — a real-scale org
    // would need a smarter shortlist (recent activity, participant overlap)
    // before this, but 25-deal demo volume doesn't need it yet.
    take: clientId ? undefined : 200,
  });
  return deals.map((d) => ({
    dealId: d.id,
    projectCodename: d.projectCodename,
    clientName: d.client.name,
    bankingService: d.bankingService.code,
    currentStageLabel: d.currentStage.label,
  }));
}

export interface DealMatchDecision extends DealMatchResult {
  /** True when a deterministic signal (thread continuity) overrode the AI's own suggestion. */
  overriddenByThreadContinuity: boolean;
}

export async function matchDeal(
  db: PrismaClient,
  aiProvider: AIProvider,
  organizationId: string,
  threadId: string,
  clientId: string | null,
  extraction: ExtractionResult,
): Promise<DealMatchDecision> {
  const candidates = await loadCandidateDeals(db, organizationId, clientId);
  const aiResult = await aiProvider.matchDeal(extraction, candidates);

  const thread = await db.emailThread.findUnique({ where: { id: threadId }, select: { dealId: true } });
  if (thread?.dealId) {
    const stillValidCandidate = candidates.some((c) => c.dealId === thread.dealId);
    // Thread continuity (spec §12: don't fragment one transaction across
    // duplicate deals) wins over a lower-confidence AI guess, but never
    // overrides a *different*, equally-explicit codename match — that
    // would silently move a reply onto the wrong deal.
    const aiFoundDifferentExplicitMatch = aiResult.matchType === "EXISTING_DEAL" && aiResult.dealId !== thread.dealId && aiResult.confidencePercent >= 95;
    if (stillValidCandidate && !aiFoundDifferentExplicitMatch) {
      return {
        matchType: "EXISTING_DEAL",
        dealId: thread.dealId,
        confidencePercent: Math.max(aiResult.confidencePercent, 90),
        reason: "Thread already linked to this deal (thread continuity)",
        promptVersion: aiResult.promptVersion,
        overriddenByThreadContinuity: true,
      };
    }
  }

  return { ...aiResult, overriddenByThreadContinuity: false };
}
