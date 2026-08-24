// Shared, dependency-free stage list (spec §26) — imported by the server
// orchestrator (to stamp EmailProcessingJob.stage as it works) and by the
// client-side Run Scan progress UI (to cycle the same labels while the
// Server Action request is in flight). No Prisma import here on purpose,
// so a client component can import this file directly.

export const PIPELINE_STAGES = [
  "Scanning emails",
  "Analyzing threads",
  "Identifying banking activity",
  "Matching deals",
  "Detecting changes",
  "Updating intelligence",
] as const;
