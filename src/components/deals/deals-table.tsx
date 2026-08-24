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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskPill, PriorityPill } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatMoney } from "@/lib/format";
import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase, Columns3, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealListItem } from "@/lib/data";
import type {
  BankingService,
  BankingServiceCode,
  DealPriority,
  RiskStatus,
} from "@/types/domain";

const ALL = "ALL";
const PAGE_SIZE = 15;

const PRIORITY_RANK: Record<DealPriority, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
const RISK_RANK: Record<RiskStatus, number> = { AT_RISK: 2, WATCH: 1, ON_TRACK: 0 };

const VALUE_TIERS = [
  { id: ALL, label: "Any value", min: 0 },
  { id: "100m", label: "$100M+", min: 100_000_000_00 },
  { id: "500m", label: "$500M+", min: 500_000_000_00 },
  { id: "1b", label: "$1B+", min: 1_000_000_000_00 },
] as const;

interface Column {
  key: string;
  label: string;
  sortable: boolean;
  align?: "right";
}

const COLUMNS: Column[] = [
  { key: "project", label: "Project", sortable: true },
  { key: "client", label: "Client", sortable: true },
  { key: "service", label: "Service", sortable: true },
  { key: "stage", label: "Stage", sortable: true },
  { key: "value", label: "Value", sortable: true, align: "right" },
  { key: "priority", label: "Priority", sortable: true },
  { key: "risk", label: "Risk", sortable: true },
  { key: "banker", label: "Lead Banker", sortable: true },
  { key: "activity", label: "Last Activity", sortable: true },
];

type SortDir = "asc" | "desc";

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
  const [stage, setStage] = useState<string>(ALL);
  const [sector, setSector] = useState<string>(ALL);
  const [valueTier, setValueTier] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<string>("activity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(COLUMNS.map((c) => c.key)),
  );

  const serviceNames = useMemo(
    () => new Map(bankingServices.map((s) => [s.id, s.name])),
    [bankingServices],
  );

  const stageOptions = useMemo(
    () => Array.from(new Set(deals.map((d) => d.currentStageLabel))).sort(),
    [deals],
  );
  const sectorOptions = useMemo(
    () => Array.from(new Set(deals.map((d) => d.sectorName))).sort(),
    [deals],
  );

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  const filtered = useMemo(() => {
    const tier = VALUE_TIERS.find((t) => t.id === valueTier) ?? VALUE_TIERS[0];
    return deals.filter((d) => {
      if (service !== ALL && d.bankingServiceId !== service) return false;
      if (priority !== ALL && d.priority !== priority) return false;
      if (risk !== ALL && d.riskStatus !== risk) return false;
      if (stage !== ALL && d.currentStageLabel !== stage) return false;
      if (sector !== ALL && d.sectorName !== sector) return false;
      if ((d.value?.amountMinorUnits ?? 0) < tier.min) return false;
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
  }, [deals, service, priority, risk, stage, sector, valueTier, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "project":
          return a.projectCodename.localeCompare(b.projectCodename) * dir;
        case "client":
          return a.clientName.localeCompare(b.clientName) * dir;
        case "service":
          return (serviceNames.get(a.bankingServiceId) ?? "").localeCompare(
            serviceNames.get(b.bankingServiceId) ?? "",
          ) * dir;
        case "stage":
          return a.currentStageLabel.localeCompare(b.currentStageLabel) * dir;
        case "value":
          return ((a.value?.amountMinorUnits ?? 0) - (b.value?.amountMinorUnits ?? 0)) * dir;
        case "priority":
          return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
        case "risk":
          return (RISK_RANK[a.riskStatus] - RISK_RANK[b.riskStatus]) * dir;
        case "banker":
          return a.leadBankerName.localeCompare(b.leadBankerName) * dir;
        case "activity":
        default:
          return (
            (new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()) * dir
          );
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir, serviceNames]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function isVisible(key: string) {
    return visibleColumns.has(key);
  }

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) {
        next.delete(key);
      } else if (!next.has(key)) {
        next.add(key);
      }
      return next;
    });
  }

  function SortHeader({ column }: { column: Column }) {
    const active = sortKey === column.key;
    return (
      <TableHead className={column.align === "right" ? "text-right" : undefined}>
        <button
          type="button"
          onClick={() => toggleSort(column.key)}
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-foreground",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {column.label}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 opacity-40" />
          )}
        </button>
      </TableHead>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-4 md:px-8">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => resetPage(setQuery)(e.target.value)}
            placeholder="Filter by deal or client…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={service} onValueChange={resetPage(setService)}>
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
        <Select value={stage} onValueChange={resetPage(setStage)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {stageOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sector} onValueChange={resetPage(setSector)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sectors</SelectItem>
            {sectorOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={resetPage(setPriority)}>
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
        <Select value={risk} onValueChange={resetPage(setRisk)}>
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
        <Select value={valueTier} onValueChange={resetPage(setValueTier)}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder="Value" />
          </SelectTrigger>
          <SelectContent>
            {VALUE_TIERS.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden gap-1.5 md:inline-flex">
              <Columns3 className="size-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={isVisible(c.key)}
                onCheckedChange={() => toggleColumn(c.key)}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {sorted.length} of {deals.length} deals
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="px-8 pb-8">
          <EmptyState icon={Briefcase} title="No deals match these filters" />
        </div>
      ) : (
        <>
          {/* Dense table at md and up (DESIGN_SYSTEM.md — desktop is primary); card layout below md. */}
          <div className="hidden px-8 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.filter((c) => isVisible(c.key)).map((c) => (
                    <SortHeader key={c.key} column={c} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((deal) => (
                  <TableRow key={deal.id} className="cursor-pointer">
                    {isVisible("project") && (
                      <TableCell className="font-medium">
                        <Link href={`/deals/${deal.id}`} className="hover:text-accent">
                          {deal.projectCodename}
                        </Link>
                      </TableCell>
                    )}
                    {isVisible("client") && (
                      <TableCell>
                        <Link
                          href={`/clients/${deal.clientId}`}
                          className="text-muted-foreground hover:text-accent"
                        >
                          {deal.clientName}
                        </Link>
                      </TableCell>
                    )}
                    {isVisible("service") && (
                      <TableCell className="text-muted-foreground">
                        {serviceNames.get(deal.bankingServiceId) ?? deal.bankingServiceId}
                      </TableCell>
                    )}
                    {isVisible("stage") && <TableCell>{deal.currentStageLabel}</TableCell>}
                    {isVisible("value") && (
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(deal.value)}
                      </TableCell>
                    )}
                    {isVisible("priority") && (
                      <TableCell>
                        <PriorityPill priority={deal.priority} />
                      </TableCell>
                    )}
                    {isVisible("risk") && (
                      <TableCell>
                        <RiskPill status={deal.riskStatus} note={deal.riskNote} />
                      </TableCell>
                    )}
                    {isVisible("banker") && (
                      <TableCell className="text-muted-foreground">{deal.leadBankerName}</TableCell>
                    )}
                    {isVisible("activity") && (
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDate(deal.lastActivityAt)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3 py-4">
              <span className="text-xs text-muted-foreground tabular-nums">
                {sorted.length === 0
                  ? "0 results"
                  : `${currentPage * PAGE_SIZE + 1}–${Math.min(
                      (currentPage + 1) * PAGE_SIZE,
                      sorted.length,
                    )} of ${sorted.length}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 px-4 pb-10 md:hidden">
            {sorted.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="rounded-md border border-border bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{deal.projectCodename}</p>
                    <p className="text-xs text-muted-foreground">{deal.clientName}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-gold">
                    {formatMoney(deal.value)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {serviceNames.get(deal.bankingServiceId) ?? deal.bankingServiceId} ·{" "}
                  {deal.currentStageLabel}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <PriorityPill priority={deal.priority} />
                  <RiskPill status={deal.riskStatus} note={deal.riskNote} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
