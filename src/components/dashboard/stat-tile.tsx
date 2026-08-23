import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-positive",
    warning: "text-warning",
    negative: "text-negative",
  }[tone];

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>
        {value}
      </span>
    </div>
  );
}
