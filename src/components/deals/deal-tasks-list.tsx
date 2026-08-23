import { PriorityPill, TaskStatusPill } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { EvidenceCitation } from "@/components/shared/evidence-citation";
import { formatDate } from "@/lib/format";
import { CheckSquare } from "lucide-react";
import type { Task } from "@/types/domain";

export function DealTasksList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="px-5 py-6">
        <EmptyState icon={CheckSquare} title="No tasks for this deal yet" />
      </div>
    );
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id} className="border-t border-border-subtle px-5 py-4 first:border-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{task.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(task.dueDate)}</p>
              {task.sourceEvidence && (
                <div className="mt-1.5">
                  <EvidenceCitation evidence={task.sourceEvidence} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <TaskStatusPill status={task.status} />
              <PriorityPill priority={task.priority} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
