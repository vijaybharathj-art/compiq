import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { PriorityPill } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/format";
import { CheckSquare } from "lucide-react";
import type { TaskListItem } from "@/lib/data";

export function ActionRequiredCard({ tasks }: { tasks: TaskListItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Action Required</CardTitle>
        <CardAction>
          <Link href="/tasks" className="text-xs text-accent hover:underline">
            View all tasks
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {tasks.length === 0 ? (
          <div className="px-5 pb-4">
            <EmptyState icon={CheckSquare} title="No outstanding tasks" />
          </div>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {task.dealCodename ?? task.clientName ?? "General"} · Due{" "}
                    {formatDate(task.dueDate)}
                  </p>
                </div>
                <PriorityPill priority={task.priority} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
