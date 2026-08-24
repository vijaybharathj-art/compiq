// Phase 1 is single-tenant: one seeded organization. Multi-org support is
// architected into the schema (every table carries organizationId) but the
// app doesn't yet have an org switcher — see ARCHITECTURE.md.
export const DEMO_ORG_ID = "org-sterling-vance";

// prisma/seed.ts anchors every seeded timestamp relative to this fixed
// instant (its own NOW constant), not the real wall clock, so the demo
// narrative ("2 hours ago", "8 days inactive") reads correctly no matter
// when the app is actually viewed. Phase 4's date-sensitive engines
// (inactivity, deadlines, momentum, briefings) default to the same anchor
// for the same reason — using the real clock would make a deal look
// increasingly "stale" the further in the future someone opens the app,
// even though nothing changed. Server Components must use this instead of
// `new Date()`/`Date.now()` directly (React's purity rule for render).
export const DEMO_NOW = new Date("2026-08-23T18:00:00Z");
