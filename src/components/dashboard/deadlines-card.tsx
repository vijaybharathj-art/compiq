import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_NOW } from "@/lib/constants";
import { bucketDeadline, deadlineUrgency } from "@/lib/intelligence/deadline";
import { formatDate } from "@/lib/format";

const URGENCY_VARIANT = { NORMAL: "default", ATTENTION: "warning", HIGH: "warning", CRITICAL: "negative" } as const;

// Deadline Intelligence surfaced on the dashboard (spec §26-27, §37).
export async function DeadlinesCard() {
  const db = getPrismaClient();
  const now = DEMO_NOW;
  const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const tasks = await db.task.findMany({
    where: { organizationId: DEMO_ORG_ID, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { lte: windowEnd } },
    include: { deal: { select: { id: true, projectCodename: true } } },
    orderBy: { dueDate: "asc" },
    take: 6,
  });

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border-subtle pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-accent" />
          Deadlines
        </CardTitle>
        <CardAction>
          <Link href="/intelligence?filter=DEADLINES" className="text-xs text-accent hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {tasks.length === 0 || !tasks.some((t) => t.dueDate) ? (
          <div className="px-5 py-6">
            <EmptyState icon={CalendarClock} title="No upcoming deadlines" />
          </div>
        ) : (
          <ul>
            {tasks
              .filter((t) => t.dueDate)
              .map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.deal ? (
                        <Link href={`/deals/${t.deal.id}`} className="hover:text-accent">
                          {t.deal.projectCodename}
                        </Link>
                      ) : (
                        "No deal"
                      )}{" "}
                      · {formatDate(t.dueDate!.toISOString())}
                    </p>
                  </div>
                  <Badge variant={URGENCY_VARIANT[deadlineUrgency(t.dueDate!, now)]} className="shrink-0">
                    {bucketDeadline(t.dueDate!, now).replace("_", " ")}
                  </Badge>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
