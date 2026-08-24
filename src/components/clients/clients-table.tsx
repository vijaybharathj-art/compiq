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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatMoney } from "@/lib/format";
import { Search, Users } from "lucide-react";
import type { ClientListItem } from "@/lib/data";
import type { ClientRelationship } from "@/types/domain";

const ALL = "ALL";

const relationshipVariant: Record<ClientRelationship, "positive" | "outline" | "default" | "warning"> = {
  ACTIVE: "positive",
  PROSPECT: "outline",
  DORMANT: "warning",
  FORMER: "default",
};

export function ClientsTable({ clients }: { clients: ClientListItem[] }) {
  const [query, setQuery] = useState("");
  const [relationship, setRelationship] = useState<string>(ALL);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (relationship !== ALL && c.relationshipStatus !== relationship) return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [clients, relationship, query]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-4 md:px-8">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by client name…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={relationship} onValueChange={setRelationship}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Relationship" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All relationships</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PROSPECT">Prospect</SelectItem>
            <SelectItem value="DORMANT">Dormant</SelectItem>
            <SelectItem value="FORMER">Former</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} of {clients.length} clients
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-8 pb-8">
          <EmptyState icon={Users} title="No clients match these filters" />
        </div>
      ) : (
        <>
          <div className="hidden px-8 pb-10 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Active Deals</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead>Primary Banker</TableHead>
                  <TableHead>Last Interaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${client.id}`} className="hover:text-accent">
                        {client.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={relationshipVariant[client.relationshipStatus]}>
                        {client.relationshipStatus.charAt(0) +
                          client.relationshipStatus.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.sectorName}</TableCell>
                    <TableCell className="text-right tabular-nums">{client.activeDealCount}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoney({ amountMinorUnits: client.totalDealValueMinorUnits, currency: "USD" })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.primaryBankerName}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(client.lastInteractionAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2.5 px-4 pb-10 md:hidden">
            {filtered.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="rounded-md border border-border bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.sectorName}</p>
                  </div>
                  <Badge variant={relationshipVariant[client.relationshipStatus]}>
                    {client.relationshipStatus.charAt(0) +
                      client.relationshipStatus.slice(1).toLowerCase()}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {client.activeDealCount} active {client.activeDealCount === 1 ? "deal" : "deals"}
                  </span>
                  <span className="font-medium tabular-nums text-gold">
                    {formatMoney({ amountMinorUnits: client.totalDealValueMinorUnits, currency: "USD" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
