"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityPill } from "@/components/shared/badges";
import { formatMoney } from "@/lib/format";
import { updateDealStage } from "@/lib/actions/mutations";
import { workflowsByService } from "@/lib/data/fixtures/workflows";
import { cn } from "@/lib/utils";
import type { DealListItem } from "@/lib/data";
import type { BankingService, BankingServiceCode } from "@/types/domain";

function DealCard({ deal, disabled }: { deal: DealListItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-md border border-border bg-card p-2.5 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Link href={`/deals/${deal.id}`} className="block" onClick={(e) => isDragging && e.preventDefault()}>
        <p className="text-xs font-medium text-foreground hover:text-accent">{deal.projectCodename}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{deal.clientName}</p>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs font-medium tabular-nums text-gold">{formatMoney(deal.value)}</span>
          <PriorityPill priority={deal.priority} />
        </div>
      </Link>
    </div>
  );
}

function StageColumn({
  stageKey,
  label,
  deals,
  disabled,
}: {
  stageKey: string;
  label: string;
  deals: DealListItem[];
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey, disabled });

  return (
    <div className="flex w-56 shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{deals.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-16 flex-col gap-2 rounded-md border border-dashed p-1.5 transition-colors",
          isOver ? "border-accent bg-accent/5" : "border-border-subtle",
        )}
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  deals: initialDeals,
  bankingServices,
  initialService,
}: {
  deals: DealListItem[];
  bankingServices: BankingService[];
  initialService: BankingServiceCode;
}) {
  const [service, setService] = useState<BankingServiceCode>(initialService);
  const [deals, setDeals] = useState(initialDeals);
  const [syncedDeals, setSyncedDeals] = useState(initialDeals);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (initialDeals !== syncedDeals) {
    setSyncedDeals(initialDeals);
    setDeals(initialDeals);
  }

  const stages = workflowsByService[service];
  const dealsForService = useMemo(() => deals.filter((d) => d.bankingServiceId === service), [deals, service]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const newStageKey = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.currentStageKey === newStageKey) return;

    const newStage = stages.find((s) => s.key === newStageKey)!;
    const previous = deals;
    setError(null);
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId ? { ...d, currentStageKey: newStageKey, currentStageLabel: newStage.label } : d,
      ),
    );

    startTransition(async () => {
      try {
        await updateDealStage(dealId, newStageKey);
        router.refresh();
      } catch {
        setDeals(previous);
        setError(`Could not move ${deal.projectCodename} — please try again.`);
      }
    });
  }

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
          {dealsForService.length} deal{dealsForService.length === 1 ? "" : "s"} in this pipeline · drag a card
          to change its stage
        </span>
        {error && <span className="text-xs text-negative">{error}</span>}
        {isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>

      <DndContext id="pipeline-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="scrollbar-thin flex gap-3 overflow-x-auto px-8 pb-10">
          {stages.map((stage) => (
            <StageColumn
              key={stage.key}
              stageKey={stage.key}
              label={stage.label}
              deals={dealsForService.filter((d) => d.currentStageKey === stage.key)}
              disabled={isPending}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
