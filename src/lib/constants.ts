// Phase 1 is single-tenant: one seeded organization. Multi-org support is
// architected into the schema (every table carries organizationId) but the
// app doesn't yet have an org switcher — see ARCHITECTURE.md.
export const DEMO_ORG_ID = "org-sterling-vance";
