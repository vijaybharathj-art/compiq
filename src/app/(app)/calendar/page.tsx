import Link from "next/link";
import { CalendarDays, Flag, CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityPill } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { dealRepository, taskRepository } from "@/lib/data";
import { formatDate } from "@/lib/format";

interface AgendaItem {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  href: string;
  icon: typeof Flag;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export default async function CalendarPage() {
  const [deals, tasks] = await Promise.all([dealRepository.list(), taskRepository.list()]);

  const items: AgendaItem[] = [];

  for (const deal of deals) {
    if (deal.nextMilestoneDate && deal.nextMilestone) {
      items.push({
        id: `milestone-${deal.id}`,
        date: deal.nextMilestoneDate,
        title: deal.nextMilestone,
        subtitle: deal.projectCodename,
        href: `/deals/${deal.id}`,
        icon: Flag,
      });
    }
    if (deal.expectedCloseDate) {
      items.push({
        id: `close-${deal.id}`,
        date: deal.expectedCloseDate,
        title: "Expected close",
        subtitle: deal.projectCodename,
        href: `/deals/${deal.id}`,
        icon: CalendarDays,
        priority: deal.priority,
      });
    }
  }

  for (const task of tasks) {
    if (task.dueDate && task.status !== "COMPLETED" && task.status !== "DISMISSED") {
      items.push({
        id: `task-${task.id}`,
        date: task.dueDate,
        title: task.title,
        subtitle: task.dealCodename ?? task.clientName ?? "General",
        href: task.dealId ? `/deals/${task.dealId}` : task.clientId ? `/clients/${task.clientId}` : "/tasks",
        icon: CheckSquare,
        priority: task.priority,
      });
    }
  }

  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const grouped = items.reduce<Record<string, AgendaItem[]>>((acc, item) => {
    const key = formatDate(item.date);
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="pb-10">
      <PageHeader
        title="Calendar"
        description="Upcoming milestones, deadlines, and expected closings across your portfolio."
      />
      <div className="px-8 pt-5">
        {items.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Nothing scheduled" />
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([date, dateItems]) => (
              <div key={date}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {date}
                </p>
                <div className="flex flex-col gap-2">
                  {dateItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5 hover:border-accent/50"
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                        </div>
                        {item.priority && <PriorityPill priority={item.priority} />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
