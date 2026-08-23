import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEnumLabel, formatMoney, initials } from "@/lib/format";
import type { DealDetail } from "@/lib/data";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export function DealFactsPanel({ deal }: { deal: DealDetail }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Deal Facts</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle">
        <Fact label="Client" value={deal.clientName} />
        {deal.targetCompanyName && <Fact label="Target" value={deal.targetCompanyName} />}
        <Fact label="Sector" value={deal.sectorName} />
        <Fact label="Geography" value={deal.geography} />
        <Fact label="Deal Type" value={formatEnumLabel(deal.dealType)} />
        <Fact label="Side" value={formatEnumLabel(deal.side)} />
        <Fact label="Enterprise Value" value={formatMoney(deal.enterpriseValue ?? deal.value)} />
        {deal.equityValue && <Fact label="Equity Value" value={formatMoney(deal.equityValue)} />}
        <Fact label="Mandate Status" value={formatEnumLabel(deal.mandateStatus)} />
        <Fact label="Probability" value={`${deal.probabilityPercent}%`} />
        <Fact label="Expected Close" value={formatDate(deal.expectedCloseDate)} />
        <Fact label="Next Milestone" value={deal.nextMilestone ?? "—"} />
      </CardContent>
    </Card>
  );
}

export function DealTeamPanel({ deal }: { deal: DealDetail }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Deal Team</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {deal.teamMembers.map(({ banker, role }) => (
          <div key={banker.id} className="flex items-center gap-2.5">
            <Avatar className="size-7">
              <AvatarFallback>{initials(banker.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{banker.name}</p>
              <p className="text-xs text-muted-foreground">{formatEnumLabel(role)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DealParticipantsPanel({ deal }: { deal: DealDetail }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle>Counterparties</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {deal.participants.length === 0 && (
          <p className="text-sm text-muted-foreground">No counterparties recorded yet.</p>
        )}
        {deal.participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <span className="text-sm text-foreground">{p.companyName}</span>
            <Badge variant="outline">{formatEnumLabel(p.role)}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
