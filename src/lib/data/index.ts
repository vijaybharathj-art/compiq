// Single import surface for all page/component code. Currently wired to
// the in-memory Demo Mode repositories — see CLAUDE.md and ARCHITECTURE.md.
// A future prisma-repository.ts satisfying the same interfaces (types.ts)
// is the only file that needs to change to go live.

import {
  demoAuditLogRepository,
  demoClientRepository,
  demoDashboardRepository,
  demoDealRepository,
  demoIntelligenceRepository,
  demoReferenceRepository,
  demoTaskRepository,
} from "./demo-repository";

export const dealRepository = demoDealRepository;
export const clientRepository = demoClientRepository;
export const taskRepository = demoTaskRepository;
export const intelligenceRepository = demoIntelligenceRepository;
export const dashboardRepository = demoDashboardRepository;
export const referenceRepository = demoReferenceRepository;
export const auditLogRepository = demoAuditLogRepository;

export * from "./types";
export { CURRENT_USER_ID } from "./fixtures/bankers";
export { bankingServices, workflowsByService } from "./fixtures/workflows";
