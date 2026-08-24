"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/shared/badges";
import { formatDateTime } from "@/lib/format";

export interface EvidenceViewerData {
  subject: string;
  fromName: string;
  receivedAt: string;
  quotedExcerpt: string;
  confidencePercent?: number;
  dealHref?: string;
}

export function EvidenceDialog({
  trigger,
  data,
}: {
  trigger: React.ReactNode;
  data: EvidenceViewerData;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            {data.subject}
          </DialogTitle>
          <DialogDescription>
            {data.fromName} · {formatDateTime(data.receivedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border-subtle bg-surface-raised/50 p-3">
          <p className="whitespace-pre-wrap text-sm text-foreground/90">&ldquo;{data.quotedExcerpt}&rdquo;</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {data.confidencePercent !== undefined ? (
            <ConfidenceBadge percent={data.confidencePercent} />
          ) : (
            <span />
          )}
          {data.dealHref && (
            <Button asChild variant="secondary" size="sm">
              <Link href={data.dealHref}>Open deal</Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
