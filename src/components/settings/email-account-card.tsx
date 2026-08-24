"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  syncEmailAccountAction,
  disconnectEmailAccountAction,
  setInitialSyncWindowAction,
  type RunAccountSyncResult,
} from "@/lib/actions/email-actions";
import { formatDateTime, relativeTimeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface EmailAccountCardData {
  id: string;
  provider: "GMAIL" | "OUTLOOK";
  emailAddress: string;
  connectionStatus: "CONNECTED" | "NEEDS_REAUTH" | "DISCONNECTED";
  connectionError: string | null;
  initialSyncCompleted: boolean;
  initialSyncWindowDays: number;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  health: "HEALTHY" | "ACTION_REQUIRED" | "NEVER_SYNCED" | "DISCONNECTED";
  /** Null when the scheduler isn't configured (no CRON_SECRET) — automatic sync isn't running yet, Sync Now is still the only trigger. */
  nextScheduledSyncAt: string | null;
  recentJobs: {
    id: string;
    displayId: string;
    status: string;
    syncType: string | null;
    messagesFetched: number;
    processedCount: number;
    relevantCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
  }[];
}

const WINDOW_OPTIONS = [30, 90, 180, 365];

type SyncState = { status: "idle" } | { status: "syncing" } | { status: "error"; message: string };

export function EmailAccountCard({ account }: { account: EmailAccountCardData }) {
  const router = useRouter();
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });
  const [lastResult, setLastResult] = useState<RunAccountSyncResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  function handleSync() {
    setSyncState({ status: "syncing" });
    syncEmailAccountAction(account.id)
      .then((result) => {
        setLastResult(result);
        setSyncState({ status: "idle" });
        router.refresh();
      })
      .catch((err: unknown) => {
        setSyncState({ status: "error", message: err instanceof Error ? err.message : "Sync failed." });
      });
  }

  function handleDisconnect() {
    startTransition(() => {
      disconnectEmailAccountAction(account.id)
        .then(() => router.refresh())
        .catch((err: unknown) => {
          setSyncState({ status: "error", message: err instanceof Error ? err.message : "Disconnect failed." });
        });
    });
  }

  function handleWindowChange(value: string) {
    startTransition(() => {
      setInitialSyncWindowAction(account.id, Number(value))
        .then(() => router.refresh())
        .catch((err: unknown) => {
          setSyncState({ status: "error", message: err instanceof Error ? err.message : "Could not update sync window." });
        });
    });
  }

  const statusBadge =
    account.connectionStatus === "CONNECTED" ? (
      <Badge variant="accent" className="gap-1">
        <CheckCircle2 className="size-3" /> Connected
      </Badge>
    ) : account.connectionStatus === "NEEDS_REAUTH" ? (
      <Badge variant="negative" className="gap-1">
        <AlertTriangle className="size-3" /> Needs reauthorization
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1">
        <XCircle className="size-3" /> Disconnected
      </Badge>
    );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Mail className="size-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-sm">{account.provider === "GMAIL" ? "Gmail" : "Microsoft Outlook"}</CardTitle>
            <CardDescription className="mt-1">{account.emailAddress}</CardDescription>
          </div>
        </div>
        {statusBadge}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <HealthBanner health={account.health} />

        {account.connectionError && account.connectionStatus !== "CONNECTED" && (
          <p className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {account.connectionError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <Fact label="Last synced" value={account.lastSyncedAt ? relativeTimeFromNow(account.lastSyncedAt) : "Never"} />
          <Fact
            label="Last successful sync"
            value={account.lastSuccessfulSyncAt ? relativeTimeFromNow(account.lastSuccessfulSyncAt) : "Never"}
          />
          <Fact label="Initial sync" value={account.initialSyncCompleted ? "Complete" : "Not yet run"} />
          <Fact
            label="Next scheduled sync"
            value={account.nextScheduledSyncAt ? formatDateTime(account.nextScheduledSyncAt) : "Not scheduled — use Sync Now"}
          />
        </div>

        {!account.initialSyncCompleted && account.connectionStatus === "CONNECTED" && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-raised px-3 py-2">
            <span className="text-xs text-muted-foreground">Look back this far on the first sync</span>
            <Select value={String(account.initialSyncWindowDays)} onValueChange={handleWindowChange} disabled={isPending}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {lastResult && (
          <div className="rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-xs">
            <p className="font-medium text-foreground">
              {lastResult.displayId}: fetched {lastResult.messagesFetched}, ingested {lastResult.messagesIngested}, skipped{" "}
              {lastResult.messagesSkipped} (already seen), {lastResult.messagesFailed} failed.
            </p>
            {lastResult.hasMore && (
              <p className="mt-1 text-muted-foreground">
                More mail is waiting — this account has more history than one Sync Now can fetch at once. Click Sync Now again to
                continue.
              </p>
            )}
          </div>
        )}

        {syncState.status === "error" && (
          <p className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">{syncState.message}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncState.status === "syncing" || account.connectionStatus !== "CONNECTED"}
            >
              {syncState.status === "syncing" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Sync Now
            </Button>
            {account.connectionStatus === "NEEDS_REAUTH" && (
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/email/oauth/${account.provider === "GMAIL" ? "gmail" : "microsoft"}/start`}>Reconnect</a>
              </Button>
            )}
          </div>

          {confirmingDisconnect ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Disconnect this mailbox?</span>
              <Button size="sm" variant="destructive" onClick={handleDisconnect} disabled={isPending}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingDisconnect(false)} disabled={isPending}>
                Cancel
              </Button>
            </div>
          ) : (
            account.connectionStatus !== "DISCONNECTED" && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDisconnect(true)}>
                Disconnect
              </Button>
            )
          )}
        </div>

        {account.recentJobs.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sync history</p>
            <div className="overflow-hidden rounded-md border border-border-subtle">
              {account.recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2 text-xs last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        job.status === "COMPLETED" && "bg-positive",
                        job.status === "FAILED" && "bg-negative",
                        job.status === "RUNNING" && "animate-pulse bg-accent",
                      )}
                    />
                    <span className="font-medium text-foreground">{job.displayId}</span>
                    <span className="text-muted-foreground">{job.syncType === "INITIAL" ? "Initial" : "Incremental"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    {job.status === "FAILED" ? (
                      <span className="text-negative">{job.errorMessage ?? "Failed"}</span>
                    ) : (
                      <span>
                        {job.processedCount} processed, {job.relevantCount} relevant
                      </span>
                    )}
                    <span>{job.startedAt ? formatDateTime(job.startedAt) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sync health (PHASE5B_PRODUCTION_EMAIL_OPERATIONS.md §32-33) — a single,
 * plain-language line answering "is this mailbox actually keeping up,"
 * computed server-side (src/app/(app)/settings/email/page.tsx) from
 * connectionStatus and how long it's been since the last *successful*
 * sync, not just whether one is nominally scheduled.
 */
function HealthBanner({ health }: { health: EmailAccountCardData["health"] }) {
  if (health === "DISCONNECTED") return null;
  if (health === "NEVER_SYNCED") return null; // the initial-sync-window prompt below already covers this state
  if (health === "HEALTHY") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive">
        <CheckCircle2 className="size-3.5 shrink-0" />
        Healthy — syncing normally.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
      <AlertTriangle className="size-3.5 shrink-0" />
      Action required — this mailbox hasn&apos;t synced successfully recently.
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}
