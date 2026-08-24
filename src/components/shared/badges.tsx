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

// Trust layer (PHASE4_5_PRODUCTION_HARDENING.md — spec §9-11). One consistent
// vocabulary for "how sure is this" across every intelligence surface, never
// a vague "AI thinks…" and never a fabricated number where none exists.
// CONFIRMED is reserved for facts that are directly recorded, not AI-derived
// (an explicit deal value, a completed task) — pass status="CONFIRMED"
// explicitly for those; everything else derives its tier from
// confidencePercent using the same thresholds as the confidence policy
// (src/lib/ai/confidence-policy.ts: >=90 auto-apply-worthy, >=70 review-worthy).
export type TrustStatus = "CONFIRMED" | "HIGH" | "MEDIUM" | "LOW";

export function trustStatusFromConfidence(percent?: number | null): TrustStatus | null {
  if (percent === null || percent === undefined) return null;
  if (percent >= 90) return "HIGH";
  if (percent >= 70) return "MEDIUM";
  return "LOW";
}

const TRUST_LABEL: Record<TrustStatus, string> = {
  CONFIRMED: "Confirmed",
  HIGH: "High Confidence",
  MEDIUM: "Medium Confidence",
  LOW: "Low Confidence",
};

const TRUST_VARIANT: Record<TrustStatus, "positive" | "accent" | "warning" | "outline"> = {
  CONFIRMED: "positive",
  HIGH: "accent",
  MEDIUM: "warning",
  LOW: "outline",
};

export function TrustBadge({ status, confidencePercent }: { status?: TrustStatus; confidencePercent?: number | null }) {
  const resolved = status ?? trustStatusFromConfidence(confidencePercent);
  if (!resolved) {
    // Never fabricate a confidence number — when none exists, say so plainly
    // rather than hiding the badge or inventing a value (spec §10).
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Evidence available
      </Badge>
    );
  }
  const showPercent = resolved !== "CONFIRMED" && confidencePercent !== null && confidencePercent !== undefined;
  return (
    <Badge variant={TRUST_VARIANT[resolved]} className="tabular-nums">
      {TRUST_LABEL[resolved]}
      {showPercent ? ` · ${Math.round(confidencePercent!)}%` : ""}
    </Badge>
  );
}

// Distinguishes what kind of statement an intelligence card is making
// (spec §11) — a deterministic fact, a rule-detected pattern, AI-narrated
// prose, or a recommended next step — so a banker never has to guess which
// parts of a card are "real" versus generated.
export type IntelligenceLabelKind = "FACT" | "DETECTED_SIGNAL" | "AI_SUMMARY" | "RECOMMENDATION";

const LABEL_TEXT: Record<IntelligenceLabelKind, string> = {
  FACT: "Fact",
  DETECTED_SIGNAL: "Detected Signal",
  AI_SUMMARY: "AI Summary",
  RECOMMENDATION: "Recommendation",
};

const LABEL_VARIANT: Record<IntelligenceLabelKind, "default" | "accent" | "gold" | "outline"> = {
  FACT: "default",
  DETECTED_SIGNAL: "accent",
  AI_SUMMARY: "gold",
  RECOMMENDATION: "outline",
};

export function IntelligenceLabelChip({ kind }: { kind: IntelligenceLabelKind }) {
  return (
    <Badge variant={LABEL_VARIANT[kind]} className="uppercase tracking-wide">
      {LABEL_TEXT[kind]}
    </Badge>
  );
}
