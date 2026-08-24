import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TrustBadge, IntelligenceLabelChip, type IntelligenceLabelKind } from "@/components/shared/badges";
import { WhyAmISeeingThis } from "@/components/shared/why-am-i-seeing-this";
import { WhyThisMatters } from "@/components/shared/why-this-matters";
import { formatMoney, relativeTimeFromNow } from "@/lib/format";
import { importanceTier } from "@/lib/intelligence/importance";
import { reviewIntelligenceEvent } from "@/lib/actions/mutations";
import { DEMO_NOW } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { IntelligenceCategory, IntelligenceReviewStatus } from "@/types/domain";

const CATEGORY_LABEL: Record<IntelligenceCategory, string> = {
  DEAL_CHANGE: "Deal Change",
  CLIENT_ACTIVITY: "Client Activity",
  TASK: "Task",
  OPPORTUNITY: "Opportunity",
  RISK: "Risk",
  IMPORTANT_EMAIL: "Important Email",
};

// A deterministic, category-level mapping of what kind of statement a card
// is making (spec §11) — not a per-event judgment call, so it stays
// consistent and auditable rather than another AI decision.
const CATEGORY_LABEL_KIND: Record<IntelligenceCategory, IntelligenceLabelKind> = {
  DEAL_CHANGE: "FACT",
  CLIENT_ACTIVITY: "DETECTED_SIGNAL",
  TASK: "RECOMMENDATION",
  OPPORTUNITY: "DETECTED_SIGNAL",
  RISK: "DETECTED_SIGNAL",
  IMPORTANT_EMAIL: "DETECTED_SIGNAL",
};

const TIER_VARIANT = {
  CRITICAL: "negative",
  HIGH: "warning",
  MEDIUM: "accent",
  LOW: "default",
  INFORMATIONAL: "outline",
} as const;

export interface WhatChangedFeedItemData {
  id: string;
  category: IntelligenceCategory;
  headline: string;
  detail: string | null;
  deltaFrom: string | null;
  deltaTo: string | null;
  confidencePercent: number | null;
  importanceScore: number | null;
  occurredAt: Date;
  dealId: string | null;
  clientId: string | null;
  reviewStatus: IntelligenceReviewStatus;
  deal: { id: string; projectCodename: string; valueMinorUnits: bigint | null; enterpriseValueMinorUnits: bigint | null; currency: string } | null;
  client: { id: string; name: string } | null;
  sourceEmail: { fromName: string | null; fromAddress: string; subject: string; bodyText: string; receivedAt: Date } | null;
}

export function WhatChangedFeedItem({ item, now = DEMO_NOW }: { item: WhatChangedFeedItemData; now?: Date }) {
  const tier = importanceTier(item.importanceScore ?? 0);
  const href = item.dealId ? `/deals/${item.dealId}` : item.clientId ? `/clients/${item.clientId}` : undefined;
  const dealValue = item.deal ? (item.deal.enterpriseValueMinorUnits ?? item.deal.valueMinorUnits) : null;
  const dismissed = item.reviewStatus === "DISMISSED";

  return (
    <div className={cn("group flex gap-3 border-b border-border-subtle px-5 py-4 last:border-0 animate-fade-in", dismissed && "opacity-50")}>
      <div className="mt-0.5 flex w-10 shrink-0 flex-col items-center gap-1">
        <span className="text-xs font-semibold tabular-nums text-foreground">{item.importanceScore ?? 0}</span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">score</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={TIER_VARIANT[tier]}>{tier}</Badge>
          <IntelligenceLabelChip kind={CATEGORY_LABEL_KIND[item.category]} />
          <Badge variant="outline">{CATEGORY_LABEL[item.category]}</Badge>
          {item.deal && (
            <span className="text-xs font-medium text-muted-foreground">
              {item.deal.projectCodename}
              {dealValue ? ` · ${formatMoney({ amountMinorUnits: Number(dealValue), currency: item.deal.currency })}` : ""}
            </span>
          )}
          {!item.deal && item.client && <span className="text-xs font-medium text-muted-foreground">{item.client.name}</span>}
          {item.reviewStatus === "REVIEWED" && <Badge variant="positive">Reviewed</Badge>}
          {dismissed && <Badge variant="outline">Dismissed</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{relativeTimeFromNow(item.occurredAt.toISOString(), now)}</span>
        </div>
        <p className="mt-1.5 text-sm font-medium text-foreground">{item.headline}</p>
        {item.detail && <WhyThisMatters text={item.detail} />}
        {item.deltaFrom && item.deltaTo && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm tabular-nums">
            <span className="text-muted-foreground">{item.deltaFrom}</span>
            <ArrowRight className="size-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{item.deltaTo}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <TrustBadge confidencePercent={item.confidencePercent} />
          {item.sourceEmail && (
            <WhyAmISeeingThis
              source={item.sourceEmail.fromName ?? item.sourceEmail.fromAddress}
              occurredAt={item.sourceEmail.receivedAt}
              dealCodename={item.deal?.projectCodename}
              evidenceQuote={item.sourceEmail.bodyText}
              confidencePercent={item.confidencePercent}
            />
          )}
          {href && (
            <Link href={href} className="text-xs text-muted-foreground hover:text-accent hover:underline underline-offset-2">
              Open {item.dealId ? "deal" : "client"} →
            </Link>
          )}
          {item.reviewStatus !== "REVIEWED" && (
            <form action={reviewIntelligenceEvent.bind(null, item.id, "REVIEWED")}>
              <button type="submit" className="text-xs text-muted-foreground hover:text-positive">
                Mark reviewed
              </button>
            </form>
          )}
          {!dismissed && (
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
