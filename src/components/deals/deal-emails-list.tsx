"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Mail, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfidenceBadge } from "@/components/shared/badges";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DealEmailView } from "@/lib/data";

function EmailRow({ email }: { email: DealEmailView }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-t border-border-subtle first:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-surface-raised/50"
      >
        <div className="flex min-w-0 items-start gap-2">
          {open ? (
            <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{email.subject}</p>
            <p className="text-xs text-muted-foreground">
              {email.fromName} → {email.toAddresses.join(", ")}
            </p>
            {!open && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{email.bodyText}</p>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatDateTime(email.receivedAt)}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 pl-11">
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{email.bodyText}</p>
          {email.aiInterpretation && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-accent/25 bg-accent/5 p-3">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-medium text-foreground">AI interpretation</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{email.aiInterpretation.summary}</p>
                <div className="mt-1.5">
                  <ConfidenceBadge percent={email.aiInterpretation.confidencePercent} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function DealEmailsList({ emails }: { emails: DealEmailView[] }) {
  if (emails.length === 0) {
    return (
      <div className="px-5 py-6">
        <EmptyState icon={Mail} title="No related emails yet" />
      </div>
    );
  }

  return (
    <ul className={cn("divide-y-0")}>
      {emails.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
    </ul>
  );
}
