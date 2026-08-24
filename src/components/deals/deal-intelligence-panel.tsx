import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/shared/badges";
import type { DealDetail } from "@/lib/data";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function DealIntelligencePanel({ deal }: { deal: DealDetail }) {
  const recentChanges = deal.intelligence.filter((i) => i.category === "DEAL_CHANGE").slice(0, 2);

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Tattava Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle">
        <Row label="Recent Changes">
          {recentChanges.length === 0 ? (
            <span className="text-muted-foreground">No recent AI-detected changes.</span>
          ) : (
            <ul className="space-y-1">
              {recentChanges.map((c) => (
                <li key={c.id}>
                  {c.headline}
                  {c.delta && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({c.delta.from} → {c.delta.to})
                    </span>
                  )}
                  .
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Next Action">{deal.nextMilestone ?? "No action currently scheduled."}</Row>
        <Row label="Risk">
          {deal.riskStatus === "ON_TRACK"
            ? "No risks detected."
            : (deal.riskNote ?? "Elevated risk detected — see timeline for detail.")}
        </Row>
        <Row label="AI Confidence">
          <ConfidenceBadge percent={deal.aiConfidencePercent} />
        </Row>
      </CardContent>
    </Card>
  );
}
