"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { triggerEmailScan, type RunScanResult } from "@/lib/actions/pipeline-actions";
import { cn } from "@/lib/utils";

// The Server Action runs the pipeline to completion synchronously (no
// background worker — see triggerEmailScan's own comment and spec §44),
// so there is no live per-stage signal to poll. This timer only advances
// which of the real PIPELINE_STAGES labels is highlighted while that one
// request is in flight — a loading indicator, not a claim that the stage
// shown literally just finished server-side. The moment the action
// resolves, everything below switches to the real returned counters;
// nothing here is ever hardcoded (spec §38).
const STAGE_INTERVAL_MS = 500;

type ScanState =
  | { status: "idle" }
  | { status: "running"; stageIndex: number }
  | { status: "running_elsewhere" }
  | { status: "done"; result: RunScanResult }
  | { status: "error"; message: string };

export function ScanRunner({ pendingCount, initiallyRunning }: { pendingCount: number; initiallyRunning?: boolean }) {
  // "running_elsewhere" covers a page load that lands mid-scan (a second
  // tab, another banker in the same org) — the server already knows a job
  // is RUNNING (spec §34), so this never has to wait for a failed click to
  // find out. There's no real per-stage signal to animate here (unlike the
  // "running" state this same component drives when it started the scan
  // itself), so it just offers a refresh rather than faking progress.
  const [state, setState] = useState<ScanState>(initiallyRunning ? { status: "running_elsewhere" } : { status: "idle" });
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function runScan() {
    setState({ status: "running", stageIndex: 0 });
    intervalRef.current = setInterval(() => {
      setState((prev) =>
        prev.status === "running"
          ? { status: "running", stageIndex: Math.min(prev.stageIndex + 1, PIPELINE_STAGES.length - 1) }
          : prev,
      );
    }, STAGE_INTERVAL_MS);

    triggerEmailScan()
      .then((result) => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setState({ status: "done", result });
        router.refresh();
      })
      .catch((err: unknown) => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setState({ status: "error", message: err instanceof Error ? err.message : "Scan failed." });
      });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        {state.status === "idle" && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {pendingCount} email{pendingCount === 1 ? "" : "s"} waiting to be scanned
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Runs the full pipeline: classification → extraction → deal matching → change detection → tasks & intelligence.
              </p>
            </div>
            <Button onClick={runScan} disabled={pendingCount === 0}>
              <PlayCircle className="size-4" />
              Run Scan
            </Button>
          </div>
        )}

        {state.status === "running_elsewhere" && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Loader2 className="size-4 animate-spin text-accent" />
              Scan in progress
            </div>
            <Button size="sm" variant="outline" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        )}

        {state.status === "running" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Loader2 className="size-4 animate-spin text-accent" />
              {PIPELINE_STAGES[state.stageIndex]}…
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.map((stage, i) => {
                // Three visually distinct states per spec §32: completed
                // (checked, solid), processing (the current one, pulsing),
                // pending (muted) — not just a binary highlighted/not.
                const isCompleted = i < state.stageIndex;
                const isProcessing = i === state.stageIndex;
                return (
                  <span
                    key={stage}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                      isCompleted && "bg-positive/15 text-positive",
                      isProcessing && "animate-pulse bg-accent/15 text-accent",
                      !isCompleted && !isProcessing && "bg-surface-raised font-normal text-muted-foreground",
                    )}
                  >
                    {isCompleted && <CheckCircle2 className="size-2.5" />}
                    {stage}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {state.status === "done" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-positive">
              <CheckCircle2 className="size-4" />
              Scan complete
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Emails scanned" value={state.result.counters.totalEmails} />
              <SummaryStat label="Banking-related" value={state.result.counters.relevantCount} />
              <SummaryStat label="Deals updated" value={state.result.counters.dealsUpdated} />
              <SummaryStat label="New tasks" value={state.result.counters.tasksCreated} />
              <SummaryStat label="Opportunities" value={state.result.counters.opportunitiesCreated} />
              <SummaryStat label="Risk signals" value={state.result.counters.risksDetected} />
              <SummaryStat label="Needs review" value={state.result.counters.suggestionsForReview} />
            </dl>
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link href="/intelligence">View Intelligence</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setState({ status: "idle" })}>
                Run again
              </Button>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-negative">Scan failed</p>
            <p className="text-xs text-muted-foreground">{state.message}</p>
            <Button size="sm" variant="outline" onClick={() => setState({ status: "idle" })}>
              Try again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
