import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { computeClientAttention } from "@/lib/intelligence/client-attention";

// "Client Attention" on the dashboard (spec §5, §25-26) — reuses the exact
// engine already backing each Client Detail page's own attention card, so
// the reasons a client is flagged never disagree between the two surfaces.
export async function ClientAttentionSummaryCard() {
  const db = getPrismaClient();
  const flagged = await computeClientAttention(db, DEMO_ORG_ID);
  const top = flagged.slice(0, 5);

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border-subtle pb-3">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-accent" />
          Client Attention
        </CardTitle>
        <CardAction>
          <Link href="/clients" className="text-xs text-accent hover:underline">
            View all clients
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {top.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState icon={Users} title="No clients need attention" description="Every relationship looks healthy right now." />
          </div>
        ) : (
          <ul>
            {top.map((c) => (
              <li key={c.clientId} className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-0">
                <div className="min-w-0">
                  <Link href={`/clients/${c.clientId}`} className="text-sm font-medium text-foreground hover:text-accent">
                    {c.clientName}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.recommendedAction}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
