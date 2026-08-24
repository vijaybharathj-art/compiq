// Single import surface for all page/component code. Wired to the
// Postgres-backed repositories (prisma-repository.ts) — see CLAUDE.md and
// ARCHITECTURE.md. demo-repository.ts (in-memory fixtures) remains in the
// codebase as the seed source of truth and as a documented fallback
// reference; it is no longer the active implementation now that a real
// database is provisioned (prisma/seed.ts populates it).

import {
  prismaAuditLogRepository,
  prismaClientRepository,
  prismaDashboardRepository,
  prismaDealRepository,
  prismaIntelligenceRepository,
  prismaNotificationRepository,
  prismaReferenceRepository,
  prismaTaskRepository,
} from "./prisma-repository";

export const dealRepository = prismaDealRepository;
export const clientRepository = prismaClientRepository;
export const taskRepository = prismaTaskRepository;
export const intelligenceRepository = prismaIntelligenceRepository;
export const dashboardRepository = prismaDashboardRepository;
export const referenceRepository = prismaReferenceRepository;
export const auditLogRepository = prismaAuditLogRepository;
export const notificationRepository = prismaNotificationRepository;

export * from "./types";
export { bankingServices, workflowsByService } from "./fixtures/workflows";
