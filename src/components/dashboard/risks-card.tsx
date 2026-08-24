import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";

const SEVERITY_VARIANT = { LOW: "default", MEDIUM: "warning", HIGH: "negative", CRITICAL: "negative" } as const;

// Deal Risk Engine surfaced on the dashboard (spec §37) — reads currently
// OPEN/ACKNOWLEDGED Risk rows directly, ranked by severity.
export async function RisksCard() {
  const db = getPrismaClient();
  const risks = await db.risk.findMany({
    where: { organizationId: DEMO_ORG_ID, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    include: { deal: { select: { id: true, projectCodename: true } } },
    orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    take: 6,
  });

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border-subtle pb-3">
        <CardTitle className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-negative" />
          Risks
        </CardTitle>
        <CardAction>
          <Link href="/intelligence?filter=RISKS" className="text-xs text-accent hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {risks.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState icon={TriangleAlert} title="No open risk signals" />
          </div>
        ) : (
          <ul>
            {risks.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-0">
                <div className="min-w-0">
                  <Link href={`/deals/${r.deal.id}`} className="text-sm font-medium text-foreground hover:text-accent">
                    {r.deal.projectCodename}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                </div>
                <Badge variant={SEVERITY_VARIANT[r.severity]} className="shrink-0">
                  {r.severity}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
