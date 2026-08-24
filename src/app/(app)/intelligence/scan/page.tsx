import { PageHeader } from "@/components/shared/page-header";
import { IntelligenceSubNav } from "@/components/intelligence/sub-nav";
import { ScanRunner } from "@/components/intelligence/scan-runner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getPendingEmailCount, getRecentJobs, getRecentlyProcessedEmails } from "@/lib/pipeline/queries";
import { DEMO_ORG_ID } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { History, Inbox } from "lucide-react";

const JOB_STATUS_VARIANT: Record<string, "positive" | "warning" | "negative" | "outline"> = {
  COMPLETED: "positive",
  RUNNING: "warning",
  FAILED: "negative",
  QUEUED: "outline",
};

const RELEVANCE_VARIANT: Record<string, "positive" | "warning" | "outline"> = {
  IB_RELEVANT: "positive",
  POSSIBLY_RELEVANT: "warning",
  NOT_RELEVANT: "outline",
};

export default async function ScanPage() {
  const [pendingCount, jobs, processedEmails] = await Promise.all([
    getPendingEmailCount(DEMO_ORG_ID),
    getRecentJobs(DEMO_ORG_ID),
    getRecentlyProcessedEmails(DEMO_ORG_ID),
  ]);
  const isJobRunning = jobs.some((j) => j.status === "RUNNING");

  return (
    <div className="pb-10">
      <PageHeader
        title="Email Scan"
        description="Run the email intelligence pipeline against your unprocessed mailbox backlog."
      />
      <IntelligenceSubNav />

      <div className="flex flex-col gap-5 px-8 pt-5">
        <ScanRunner pendingCount={pendingCount} initiallyRunning={isJobRunning} />

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <CardTitle>Scan history</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {jobs.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState icon={History} title="No scans yet" description="Run your first scan above." />
              </div>
            ) : (
              <ul>
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{job.displayId}</span>
                        <Badge variant={JOB_STATUS_VARIANT[job.status] ?? "outline"}>{job.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {job.processedCount} scanned · {job.relevantCount} banking-related · {job.dealsUpdated} deals
                        updated · {job.tasksCreated} tasks · {job.opportunitiesCreated} opportunities ·{" "}
                        {job.risksDetected} risks · {job.suggestionsForReview} pending review
                        {job.errorMessage ? ` · error: ${job.errorMessage}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {job.finishedAt ? formatDateTime(job.finishedAt) : formatDateTime(job.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            <CardTitle>Email Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {processedEmails.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState icon={Inbox} title="No processed emails yet" />
              </div>
            ) : (
              <ul>
                {processedEmails.map((email) => (
                  <li
                    key={email.id}
                    className="flex flex-wrap items-start justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{email.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {email.fromName}
                        {email.dealCodename ? ` · ${email.dealCodename}` : ""}
                      </p>
                      {email.classificationReason && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{email.classificationReason}</p>
                      )}
                      {email.processingStatus === "PROCESSING_FAILED" && (
                        <p className="mt-0.5 text-xs text-negative">Processing failed: {email.processingError}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={RELEVANCE_VARIANT[email.relevance] ?? "outline"}>
                        {email.relevance.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(email.receivedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
