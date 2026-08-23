import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { Sparkles } from "lucide-react";
import type { Opportunity } from "@/types/domain";
import { getBankingService } from "@/lib/data/fixtures/workflows";

export function NewOpportunitiesCard({
  opportunities,
}: {
  opportunities: (Opportunity & { clientName: string })[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Opportunities</CardTitle>
        <CardAction>
          <Link
            href="/intelligence?category=OPPORTUNITY"
            className="text-xs text-accent hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {opportunities.length === 0 ? (
          <div className="px-5 pb-4">
            <EmptyState icon={Sparkles} title="No new opportunities detected" />
          </div>
        ) : (
          <ul>
            {opportunities.map((opp) => (
              <li
                key={opp.id}
                className="border-t border-border-subtle px-5 py-3 first:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/clients/${opp.clientId}`}
                    className="text-sm font-medium text-foreground hover:text-accent"
                  >
                    {opp.clientName}
                  </Link>
                  <ConfidenceBadge percent={opp.confidencePercent} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{opp.signalText}</p>
                <p className="mt-1.5 text-xs font-medium text-accent">
                  Potential {getBankingService(opp.potentialServiceId).name}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
