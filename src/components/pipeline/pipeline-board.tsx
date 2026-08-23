"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityPill } from "@/components/shared/badges";
import { formatMoney } from "@/lib/format";
import { workflowsByService } from "@/lib/data/fixtures/workflows";
import type { DealListItem } from "@/lib/data";
import type { BankingService, BankingServiceCode } from "@/types/domain";

export function PipelineBoard({
  deals,
  bankingServices,
  initialService,
}: {
  deals: DealListItem[];
  bankingServices: BankingService[];
  initialService: BankingServiceCode;
}) {
  const [service, setService] = useState<BankingServiceCode>(initialService);
  const stages = workflowsByService[service];
  const dealsForService = useMemo(
    () => deals.filter((d) => d.bankingServiceId === service),
    [deals, service],
  );

  return (
    <div>
      <div className="flex items-center gap-2 px-8 py-4">
        <Select value={service} onValueChange={(v) => setService(v as BankingServiceCode)}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bankingServices.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums">
          {dealsForService.length} deal{dealsForService.length === 1 ? "" : "s"} in this pipeline
        </span>
      </div>

      <div className="scrollbar-thin flex gap-3 overflow-x-auto px-8 pb-10">
        {stages.map((stage) => {
          const stageDeals = dealsForService.filter((d) => d.currentStageKey === stage.key);
          return (
            <div key={stage.key} className="flex w-56 shrink-0 flex-col gap-2.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{stageDeals.length}</span>
              </div>
              <div className="flex min-h-16 flex-col gap-2 rounded-md border border-dashed border-border-subtle p-1.5">
                {stageDeals.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/deals/${deal.id}`}
                    className="rounded-md border border-border bg-card p-2.5 hover:border-accent/50"
                  >
                    <p className="text-xs font-medium text-foreground">{deal.projectCodename}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{deal.clientName}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-medium tabular-nums text-gold">
                        {formatMoney(deal.value)}
                      </span>
                      <PriorityPill priority={deal.priority} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
