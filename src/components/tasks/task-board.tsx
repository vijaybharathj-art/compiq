import Link from "next/link";
import { PriorityPill, ConfidenceBadge } from "@/components/shared/badges";
import { EvidenceCitation } from "@/components/shared/evidence-citation";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/format";
import { CheckSquare } from "lucide-react";
import type { TaskListItem } from "@/lib/data";
import type { TaskStatus } from "@/types/domain";

const columns: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
  { status: "DISMISSED", label: "Dismissed" },
];

function TaskCard({ task }: { task: TaskListItem }) {
  return (
    <div className="rounded-md border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{task.title}</p>
        <PriorityPill priority={task.priority} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {task.dealCodename && (
            <Link
              href={`/deals/${task.dealId}`}
              className="text-xs font-medium text-accent hover:underline"
            >
              {task.dealCodename}
            </Link>
          )}
          {!task.dealCodename && task.clientName && (
            <Link
              href={`/clients/${task.clientId}`}
              className="text-xs font-medium text-accent hover:underline"
            >
              {task.clientName}
            </Link>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          Due {formatDate(task.dueDate)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{task.ownerName}</span>
        <ConfidenceBadge percent={task.aiConfidencePercent} />
      </div>
      {task.sourceEvidence && (
        <div className="mt-2">
          <EvidenceCitation evidence={task.sourceEvidence} />
        </div>
      )}
    </div>
  );
}

export function TaskBoard({ tasks }: { tasks: TaskListItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 px-8 pb-10 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => {
        const items = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col.label}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.length === 0 ? (
                <EmptyState icon={CheckSquare} title="Nothing here" />
              ) : (
                items.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
