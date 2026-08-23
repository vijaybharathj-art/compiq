import { Quote } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Evidence } from "@/types/domain";
import { formatDateTime } from "@/lib/format";

export function EvidenceCitation({ evidence }: { evidence: Evidence }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-accent hover:underline underline-offset-2">
          <Quote className="size-3" />
          View source email
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{evidence.senderName}</span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(evidence.sentAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{evidence.senderEmail}</p>
          <p className="text-xs font-medium text-foreground">{evidence.subject}</p>
          <blockquote className="border-l-2 border-accent/40 pl-2.5 text-sm text-foreground/90 italic">
            &ldquo;{evidence.quotedExcerpt}&rdquo;
          </blockquote>
        </div>
      </PopoverContent>
    </Popover>
  );
}
