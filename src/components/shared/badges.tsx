import { Badge } from "@/components/ui/badge";
import type { DealPriority, RiskStatus, TaskStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

export function RiskPill({ status, note }: { status: RiskStatus; note?: string }) {
  const map: Record<RiskStatus, { label: string; variant: "positive" | "warning" | "negative" }> = {
    ON_TRACK: { label: "On Track", variant: "positive" },
    WATCH: { label: "Watch", variant: "warning" },
    AT_RISK: { label: "At Risk", variant: "negative" },
  };
  const cfg = map[status];
  return (
    <Badge variant={cfg.variant} title={note}>
      {cfg.label}
    </Badge>
  );
}

export function PriorityPill({ priority }: { priority: DealPriority }) {
  const map: Record<DealPriority, { label: string; variant: "negative" | "warning" | "default" | "outline" }> = {
    CRITICAL: { label: "Critical", variant: "negative" },
    HIGH: { label: "High", variant: "warning" },
    MEDIUM: { label: "Medium", variant: "default" },
    LOW: { label: "Low", variant: "outline" },
  };
  const cfg = map[priority];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, { label: string; variant: "default" | "accent" | "positive" | "outline" }> = {
    TODO: { label: "To Do", variant: "outline" },
    IN_PROGRESS: { label: "In Progress", variant: "accent" },
    COMPLETED: { label: "Completed", variant: "positive" },
    DISMISSED: { label: "Dismissed", variant: "default" },
  };
  const cfg = map[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function ConfidenceBadge({ percent }: { percent?: number }) {
  if (percent === undefined) return null;
  const variant = percent >= 90 ? "positive" : percent >= 70 ? "warning" : "outline";
  return (
    <Badge variant={variant} className="tabular-nums">
      {percent}% confidence
    </Badge>
  );
}

export function ConfidenceDot({ percent, className }: { percent?: number; className?: string }) {
  if (percent === undefined) return null;
  const color =
    percent >= 90 ? "bg-positive" : percent >= 70 ? "bg-warning" : "bg-muted-foreground";
  return <span className={cn("inline-block size-1.5 rounded-full", color, className)} />;
}
