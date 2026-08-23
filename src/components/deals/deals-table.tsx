"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RiskPill, PriorityPill } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatMoney } from "@/lib/format";
import { Briefcase, Search } from "lucide-react";
import type { DealListItem } from "@/lib/data";
import type {
  BankingService,
  BankingServiceCode,
  DealPriority,
  RiskStatus,
} from "@/types/domain";

const ALL = "ALL";

export function DealsTable({
  deals,
  bankingServices,
  initialService,
}: {
  deals: DealListItem[];
  bankingServices: BankingService[];
  initialService?: BankingServiceCode;
}) {
  const [query, setQuery] = useState("");
  const [service, setService] = useState<string>(initialService ?? ALL);
  const [priority, setPriority] = useState<string>(ALL);
  const [risk, setRisk] = useState<string>(ALL);

  const serviceNames = useMemo(
    () => new Map(bankingServices.map((s) => [s.id, s.name])),
    [bankingServices],
  );

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (service !== ALL && d.bankingServiceId !== service) return false;
      if (priority !== ALL && d.priority !== priority) return false;
      if (risk !== ALL && d.riskStatus !== risk) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !d.projectCodename.toLowerCase().includes(q) &&
          !d.clientName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [deals, service, priority, risk, query]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-8 py-4">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by deal or client…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All services</SelectItem>
            {bankingServices.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as DealPriority[]).map((p) => (
              <SelectItem key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All risk</SelectItem>
            {(["ON_TRACK", "WATCH", "AT_RISK"] as RiskStatus[]).map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} of {deals.length} deals
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-8 pb-8">
          <EmptyState icon={Briefcase} title="No deals match these filters" />
        </div>
      ) : (
        <div className="px-8 pb-10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Lead Banker</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((deal) => (
                <TableRow key={deal.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/deals/${deal.id}`} className="hover:text-accent">
                      {deal.projectCodename}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/clients/${deal.clientId}`} className="text-muted-foreground hover:text-accent">
                      {deal.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {serviceNames.get(deal.bankingServiceId) ?? deal.bankingServiceId}
                  </TableCell>
                  <TableCell>{deal.currentStageLabel}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(deal.value)}
                  </TableCell>
                  <TableCell>
                    <PriorityPill priority={deal.priority} />
                  </TableCell>
                  <TableCell>
                    <RiskPill status={deal.riskStatus} note={deal.riskNote} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{deal.leadBankerName}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(deal.lastActivityAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
