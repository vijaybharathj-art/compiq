import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Mail,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/shared/badges";
import { EvidenceCitation } from "@/components/shared/evidence-citation";
import { relativeTimeFromNow } from "@/lib/format";
import { reviewIntelligenceEvent } from "@/lib/actions/mutations";
import { cn } from "@/lib/utils";
import type { IntelligenceCategory, IntelligenceItem } from "@/types/domain";

const categoryConfig: Record<
  IntelligenceCategory,
  { label: string; icon: typeof TrendingUp; variant: "accent" | "positive" | "warning" | "negative" | "default" }
> = {
  DEAL_CHANGE: { label: "Deal Change", icon: TrendingUp, variant: "accent" },
  CLIENT_ACTIVITY: { label: "Client Activity", icon: Users, variant: "default" },
  TASK: { label: "Task", icon: Briefcase, variant: "default" },
  OPPORTUNITY: { label: "Opportunity", icon: Sparkles, variant: "positive" },
  RISK: { label: "Risk", icon: TriangleAlert, variant: "negative" },
  IMPORTANT_EMAIL: { label: "Important Email", icon: Mail, variant: "default" },
};

export function IntelligenceFeedItem({
  item,
  showReviewActions = false,
}: {
  item: IntelligenceItem & { dealCodename?: string; clientName?: string };
  showReviewActions?: boolean;
}) {
  const cfg = categoryConfig[item.category];
  const Icon = cfg.icon;
  const href = item.dealId
    ? `/deals/${item.dealId}`
    : item.clientId
      ? `/clients/${item.clientId}`
      : undefined;
  const dismissed = item.reviewStatus === "DISMISSED";

  return (
    <div
      className={cn(
        "group flex gap-3 border-b border-border-subtle px-5 py-4 last:border-0 animate-fade-in",
        dismissed && "opacity-50",
      )}
    >
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {(item.dealCodename || item.clientName) && (
            <span className="text-xs font-medium text-muted-foreground">
              {item.dealCodename ?? item.clientName}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {relativeTimeFromNow(item.occurredAt, new Date("2026-08-23T18:00:00Z"))}
          </span>
          {item.reviewStatus === "REVIEWED" && <Badge variant="positive">Reviewed</Badge>}
          {dismissed && <Badge variant="outline">Dismissed</Badge>}
        </div>
        <p className="mt-1.5 text-sm font-medium text-foreground">{item.headline}</p>
        {item.detail && (
          <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
        )}
        {item.delta && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm tabular-nums">
            <span className="text-muted-foreground">{item.delta.from}</span>
            <ArrowRight className="size-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{item.delta.to}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <ConfidenceBadge percent={item.confidencePercent} />
          {item.evidence && <EvidenceCitation evidence={item.evidence} />}
          {href && (
            <Link
              href={href}
              className="text-xs text-muted-foreground hover:text-accent hover:underline underline-offset-2"
            >
              Open {item.dealId ? "deal" : "client"} →
            </Link>
          )}
          {showReviewActions && item.reviewStatus !== "REVIEWED" && (
            <form action={reviewIntelligenceEvent.bind(null, item.id, "REVIEWED")}>
              <button type="submit" className="text-xs text-muted-foreground hover:text-positive">
                Mark reviewed
              </button>
            </form>
          )}
          {showReviewActions && !dismissed && (
            <form action={reviewIntelligenceEvent.bind(null, item.id, "DISMISSED")}>
              <button type="submit" className="text-xs text-muted-foreground hover:text-negative">
                Dismiss
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
