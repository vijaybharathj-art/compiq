import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RiskPill } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney } from "@/lib/format";
import { getBankingService } from "@/lib/data/fixtures/workflows";
import { Briefcase } from "lucide-react";
import type { DealListItem } from "@/lib/data";

export function ClientEngagements({ deals }: { deals: DealListItem[] }) {
  if (deals.length === 0) {
    return (
      <div className="px-5 py-6">
        <EmptyState icon={Briefcase} title="No engagements on record for this client" />
      </div>
    );
  }

  return (
    <ul>
      {deals.map((deal) => (
        <li key={deal.id} className="border-t border-border-subtle px-5 py-4 first:border-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/deals/${deal.id}`}
                className="text-sm font-medium text-foreground hover:text-accent"
              >
                {deal.projectCodename}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="accent">{getBankingService(deal.bankingServiceId).name}</Badge>
                <span className="text-xs text-muted-foreground">{deal.currentStageLabel}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-sm font-medium tabular-nums text-gold">
                {formatMoney(deal.value)}
              </span>
              <RiskPill status={deal.riskStatus} note={deal.riskNote} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
