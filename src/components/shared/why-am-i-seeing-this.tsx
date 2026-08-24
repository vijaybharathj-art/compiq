import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrustBadge } from "@/components/shared/badges";
import { formatDateTime } from "@/lib/format";

// "Why am I seeing this?" (PHASE4_5_PRODUCTION_HARDENING.md — spec §8, §12).
// The one reusable evidence surface for every AI-derived intelligence card —
// dashboard priorities, What Changed, Deal Detail, briefings — so a banker
// always finds the same answer (source, date, evidence, confidence) in the
// same place, rather than each surface inventing its own popover shape.

export interface WhyAmISeeingThisProps {
  source?: string;
  occurredAt?: Date;
  dealCodename?: string;
  evidenceQuote?: string;
  confidencePercent?: number | null;
  emailHref?: string;
  triggerLabel?: string;
}

export function WhyAmISeeingThis({
  source,
  occurredAt,
  dealCodename,
  evidenceQuote,
  confidencePercent,
  emailHref,
  triggerLabel = "Why am I seeing this?",
}: WhyAmISeeingThisProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-accent hover:underline underline-offset-2">
          <HelpCircle className="size-3" />
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {source && (
              <>
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium text-foreground">{source}</span>
              </>
            )}
            {occurredAt && (
              <>
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium text-foreground">{formatDateTime(occurredAt.toISOString())}</span>
              </>
            )}
            {dealCodename && (
              <>
                <span className="text-muted-foreground">Deal</span>
                <span className="font-medium text-foreground">{dealCodename}</span>
              </>
            )}
          </div>
          {evidenceQuote && (
            <blockquote className="border-l-2 border-accent/40 pl-2.5 text-sm italic text-foreground/90">
              &ldquo;{evidenceQuote.slice(0, 220)}&rdquo;
            </blockquote>
          )}
          <div className="flex items-center justify-between pt-0.5">
            <TrustBadge confidencePercent={confidencePercent} />
            {emailHref && (
              <Link href={emailHref} className="text-xs text-accent hover:underline underline-offset-2">
                View email →
              </Link>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
