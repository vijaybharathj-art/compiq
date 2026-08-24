"use client";

import { useState, useTransition } from "react";
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
import { PriorityPill, ConfidenceBadge } from "@/components/shared/badges";
import { EvidenceCitation } from "@/components/shared/evidence-citation";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/format";
import { updateTaskStatus } from "@/lib/actions/mutations";
import { cn } from "@/lib/utils";
import { CheckSquare } from "lucide-react";
import type { TaskListItem } from "@/lib/data";
import type { TaskStatus } from "@/types/domain";

const columns: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
  { status: "DISMISSED", label: "Dismissed" },
];

function TaskCard({ task, disabled }: { task: TaskListItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-md border border-border bg-card p-3.5 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
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

function TaskColumn({
  status,
  label,
  tasks,
  disabled,
}: {
  status: TaskStatus;
  label: string;
  tasks: TaskListItem[];
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-col gap-2.5 rounded-md p-1 transition-colors",
          isOver && "bg-accent/5 ring-1 ring-accent/40",
        )}
      >
        {tasks.length === 0 ? (
          <EmptyState icon={CheckSquare} title="Nothing here" />
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} disabled={disabled} />)
        )}
      </div>
    </div>
  );
}

export function TaskBoard({ tasks: initialTasks }: { tasks: TaskListItem[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [syncedTasks, setSyncedTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (initialTasks !== syncedTasks) {
    setSyncedTasks(initialTasks);
    setTasks(initialTasks);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const previous = tasks;
    setError(null);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, newStatus);
        router.refresh();
      } catch {
        setTasks(previous);
        setError(`Could not update "${task.title}" — please try again.`);
      }
    });
  }

  return (
    <div>
      {(error || isPending) && (
        <div className="px-8 pb-2">
          {error && <span className="text-xs text-negative">{error}</span>}
          {isPending && !error && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
      )}
      <DndContext id="task-board-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 px-8 pb-10 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => (
            <TaskColumn
              key={col.status}
              status={col.status}
              label={col.label}
              tasks={tasks.filter((t) => t.status === col.status)}
              disabled={isPending}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
