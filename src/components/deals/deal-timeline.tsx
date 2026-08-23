import {
  ArrowRight,
  Flag,
  GitCommitHorizontal,
  StickyNote,
  TriangleAlert,
  Users,
} from "lucide-react";
import { ConfidenceBadge } from "@/components/shared/badges";
import { EvidenceCitation } from "@/components/shared/evidence-citation";
import { formatDateTime } from "@/lib/format";
import type { DealEvent } from "@/types/domain";

const iconByType: Record<DealEvent["type"], typeof Flag> = {
  STAGE_CHANGE: GitCommitHorizontal,
  VALUE_CHANGE: GitCommitHorizontal,
  PARTICIPANT_ADDED: Users,
  RISK_FLAGGED: TriangleAlert,
  MILESTONE: Flag,
  NOTE: StickyNote,
};

export function DealTimeline({ events }: { events: DealEvent[] }) {
  if (events.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">No timeline activity yet.</p>;
  }

  return (
    <ol className="relative">
      {events.map((event, i) => {
        const Icon = iconByType[event.type];
        const isRisk = event.type === "RISK_FLAGGED";
        return (
          <li key={event.id} className="relative flex gap-3 px-5 pb-6 last:pb-0">
            {i < events.length - 1 && (
              <span className="absolute left-[26px] top-7 bottom-0 w-px bg-border-subtle" />
            )}
            <div
              className={
                "z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border " +
                (isRisk
                  ? "border-negative/40 bg-negative/10 text-negative"
                  : "border-border bg-surface-raised text-muted-foreground")
              }
            >
              <Icon className="size-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(event.occurredAt)}
                </span>
                <ConfidenceBadge percent={event.confidencePercent} />
              </div>
              <p className="mt-0.5 text-sm text-foreground">{event.note}</p>
              {event.previousValue && event.newValue && (
                <p className="mt-1 flex items-center gap-1.5 text-sm tabular-nums">
                  <span className="text-muted-foreground">{event.previousValue}</span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="font-medium text-foreground">{event.newValue}</span>
                </p>
              )}
              {event.evidence && (
                <div className="mt-1.5">
                  <EvidenceCitation evidence={event.evidence} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
