export interface AuditLogEntry {
  id: string;
  actorName: string;
  action: string;
  entityLabel: string;
  entityHref?: string;
  metadata?: string;
  occurredAt: string;
}

export const auditLogEntries: AuditLogEntry[] = [
  {
    id: "audit-1",
    actorName: "Tattava AI",
    action: "Auto-applied deal value change",
    entityLabel: "Project Falcon",
    entityHref: "/deals/deal-falcon",
    metadata: "$680M → $750M · 94% confidence",
    occurredAt: "2026-08-23T14:10:00Z",
  },
  {
    id: "audit-2",
    actorName: "Tattava AI",
    action: "Auto-applied stage change",
    entityLabel: "Project Falcon",
    entityHref: "/deals/deal-falcon",
    metadata: "Buyer Outreach → Management Meetings · 91% confidence",
    occurredAt: "2026-08-20T16:00:00Z",
  },
  {
    id: "audit-3",
    actorName: "Sarah Chen",
    action: "Accepted AI-suggested update",
    entityLabel: "Project Orion",
    entityHref: "/deals/deal-orion",
    metadata: "Buyer diligence request logged as task",
    occurredAt: "2026-08-14T10:06:00Z",
  },
  {
    id: "audit-4",
    actorName: "Tattava AI",
    action: "Flagged deal at risk",
    entityLabel: "Project Orion",
    entityHref: "/deals/deal-orion",
    metadata: "No client activity for 9 days",
    occurredAt: "2026-08-23T08:00:00Z",
  },
  {
    id: "audit-5",
    actorName: "James Whitfield",
    action: "Advanced deal stage",
    entityLabel: "Project Atlas",
    entityHref: "/deals/deal-atlas",
    metadata: "Rating → Documentation",
    occurredAt: "2026-08-19T11:25:00Z",
  },
  {
    id: "audit-6",
    actorName: "Bharath Vijay",
    action: "Connected email account",
    entityLabel: "Demo Mode",
    metadata: "Gmail connection simulated for demo purposes",
    occurredAt: "2026-08-01T09:00:00Z",
  },
];
