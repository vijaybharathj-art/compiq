"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/shared/badges";
import { EvidenceDialog } from "@/components/intelligence/evidence-dialog";
import { acceptExtraction, rejectExtraction } from "@/lib/actions/pipeline-actions";
import { formatDateTime } from "@/lib/format";
import type { PendingSuggestion } from "@/lib/pipeline/queries";

const CHANGE_LABELS: Record<string, string> = {
  DEAL_VALUE_CHANGED: "Deal Value",
  STAGE_CHANGED: "Potential Stage Change",
  MANDATE_CHANGED: "Mandate Change",
  NO_CHANGE: "Extraction",
};

export function ReviewItem({ suggestion }: { suggestion: PendingSuggestion }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function accept() {
    startTransition(async () => {
      await acceptExtraction(suggestion.id);
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      await rejectExtraction(suggestion.id);
      router.refresh();
    });
  }

  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {suggestion.dealId ? (
              <Link href={`/deals/${suggestion.dealId}`} className="text-sm font-medium text-foreground hover:text-accent">
                {suggestion.dealCodename}
              </Link>
            ) : (
              <span className="text-sm font-medium text-foreground">{suggestion.clientName ?? "Unknown"}</span>
            )}
            <span className="text-xs text-muted-foreground">{CHANGE_LABELS[suggestion.changeType] ?? suggestion.changeType}</span>
          </div>
          {suggestion.previousValue && suggestion.newValue ? (
            <p className="mt-1 text-sm text-foreground/90">
              <span className="tabular-nums">{suggestion.previousValue}</span>
              <span className="mx-1.5 text-muted-foreground">→</span>
              <span className="font-medium tabular-nums text-gold">{suggestion.newValue}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{suggestion.emailSubject}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Source: {suggestion.emailFrom} · {formatDateTime(suggestion.emailReceivedAt)}
          </p>
        </div>
        <ConfidenceBadge percent={suggestion.confidencePercent} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={accept} disabled={isPending}>
          <Check className="size-3.5" /> Accept
        </Button>
        <Button size="sm" variant="outline" onClick={reject} disabled={isPending}>
          <X className="size-3.5" /> Reject
        </Button>
        {suggestion.evidenceExcerpt && (
          <EvidenceDialog
            trigger={
              <Button size="sm" variant="ghost">
                <Eye className="size-3.5" /> Review
              </Button>
            }
            data={{
              subject: suggestion.emailSubject,
              fromName: suggestion.emailFrom,
              receivedAt: suggestion.emailReceivedAt,
              quotedExcerpt: suggestion.evidenceExcerpt,
              confidencePercent: suggestion.confidencePercent,
              dealHref: suggestion.dealId ? `/deals/${suggestion.dealId}` : undefined,
            }}
          />
        )}
      </div>
    </Card>
  );
}
