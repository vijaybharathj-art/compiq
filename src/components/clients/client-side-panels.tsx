import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/shared/badges";
import { EvidenceCitation } from "@/components/shared/evidence-citation";
import { EmptyState } from "@/components/shared/empty-state";
import { getBankingService } from "@/lib/data/fixtures/workflows";
import { formatMoney } from "@/lib/format";
import { Sparkles } from "lucide-react";
import type { ClientDetail } from "@/lib/data";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export function ClientFactsPanel({ client }: { client: ClientDetail }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Client Facts</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle">
        <Fact label="Sector" value={client.sectorName} />
        <Fact label="Headquarters" value={client.headquarters} />
        <Fact label="Website" value={client.website} />
        {client.foundedYear && <Fact label="Founded" value={client.foundedYear} />}
        <Fact label="Coverage Banker" value={client.primaryBankerName} />
        <Fact
          label="Total Transaction Value"
          value={formatMoney({ amountMinorUnits: client.totalDealValueMinorUnits, currency: "USD" })}
        />
      </CardContent>
    </Card>
  );
}

export function ClientContactsPanel({ client }: { client: ClientDetail }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Key Contacts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {client.contacts.map((c) => (
          <div key={c.id}>
            <p className="text-sm font-medium text-foreground">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.title}</p>
            <p className="text-xs text-accent">{c.email}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ClientOpportunitiesPanel({ client }: { client: ClientDetail }) {
  const opportunities = client.opportunities.filter((o) => o.status !== "DISMISSED");
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Potential Opportunities</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {opportunities.length === 0 ? (
          <div className="px-5 pb-4">
            <EmptyState icon={Sparkles} title="No signals detected" />
          </div>
        ) : (
          <ul>
            {opportunities.map((o) => (
              <li key={o.id} className="border-t border-border-subtle px-5 py-3 first:border-0">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="accent">{getBankingService(o.potentialServiceId).name}</Badge>
                  <ConfidenceBadge percent={o.confidencePercent} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{o.signalText}</p>
                <div className="mt-1.5">
                  <EvidenceCitation evidence={o.sourceEvidence} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
