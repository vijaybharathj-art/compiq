import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealStageDefinition } from "@/types/domain";

export function StageProgress({
  stages,
  currentStageKey,
}: {
  stages: DealStageDefinition[];
  currentStageKey: string;
}) {
  const currentIndex = stages.findIndex((s) => s.key === currentStageKey);

  return (
    <div className="scrollbar-thin flex items-center gap-0 overflow-x-auto pb-1">
      {stages.map((stage, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={stage.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5 px-2">
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                  done && "border-positive bg-positive/15 text-positive",
                  current && "border-accent bg-accent text-accent-foreground",
                  !done && !current && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-medium",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 shrink-0",
                  i < currentIndex ? "bg-positive" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
