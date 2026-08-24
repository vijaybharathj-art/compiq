# Tattava — Security Model

Investment banking data is treated as highly confidential by default —
undisclosed deal terms, client relationships, and valuations are
market-moving information.

## 1. Authentication

- **Phase 1 status**: sign-in is a Credentials provider ("continue as
  {seeded banker}") — explicitly a demo mechanism, not a real credential
  exchange. `authorize()` looks up the selected user by id in the seeded
  `User` table; no password or secret is ever collected, checked, or
  stored. Session strategy is JWT (`AUTH_SECRET` env var), and
  `src/proxy.ts` redirects any unauthenticated request (other than
  `/login` and `/api/auth/*`) to the login page.
- **Planned**: Auth.js (NextAuth v5) also has **Google OAuth** and
  **Microsoft Entra ID OAuth** providers configured in the same
  `src/lib/auth/config.ts` for when real client credentials exist — those
  remain the only two production sign-in methods the product will offer.
  Tattava will never request or store a user's mailbox password under
  either path.
- Once real OAuth is enabled, the plan is to move to database-backed
  sessions (via `PrismaAdapter`, already wired but currently only
  constructed when `DATABASE_URL` is present) so a session can be revoked
  server-side (forced sign-out, deprovisioned org member) without waiting
  for JWT expiry — see ARCHITECTURE.md §2.7.
- OAuth client secrets and the NextAuth secret are read from environment
  variables only (`GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`,
  `AUTH_SECRET`) — never committed, never hardcoded. `.env.example`
  documents required variables with placeholder values only.
- **A separate, live OAuth flow exists as of Phase 5** for connecting a
  real mailbox (Settings → Email), reusing the same Google/Microsoft app
  credentials above at a narrower, read-only scope
  (`gmail.readonly` / `offline_access Mail.Read`) — this authorizes
  *mailbox read access*, not user *sign-in*, and is unrelated to the
  Credentials-based demo login above. See
  `PHASE5_REAL_EMAIL_INTEGRATION.md` §1 for its CSRF/state-binding and
  account-linking defenses.

## 2. Authorization / organization isolation

- Every tenant-scoped table carries `organizationId`. Every repository
  method requires an `organizationId` argument and every Prisma query
  filters on it — there is no "list all deals" code path that omits the
  tenant filter.
- Role-based access control via `OrganizationMember.role`
  (`OWNER/ADMIN/BANKER/ANALYST/VIEWER`) is the intended model: write
  actions (accept/reject AI suggestions, edit deal fields, connect
  mailboxes) should require `BANKER` or above; `VIEWER` read-only; org
  administration `ADMIN`/`OWNER`. **Current status**: every Server Action
  across every phase, Phase 5's mailbox-connect actions included, checks
  only that a session exists (`auth()` returns a user) — none yet checks
  `role`. This is a pre-existing gap across the whole app, not something
  Phase 5 introduced; noted here rather than left silently implied as
  already enforced.
- Team scoping (`M&A`, `ECM`, `DCM`, …) is a filter, not a hard security
  boundary in v1 — documented as a planned refinement if cross-team
  confidentiality walls are required (e.g. restructuring ethical walls).

## 3. Data protection

- Encryption in transit: HTTPS everywhere (enforced at the hosting/edge
  layer); OAuth tokens and API calls to Gmail/Graph/Anthropic/OpenAI are
  TLS-only.
- Encryption at rest: relies on the managed Postgres provider's at-rest
  encryption; OAuth access **and** refresh tokens stored in `EmailAccount`
  are additionally application-encrypted — **live** as of Phase 5
  (`src/lib/email/token-crypto.ts`, AES-256-GCM, random IV per encryption,
  auth tag for tamper detection, key from `EMAIL_TOKEN_ENCRYPTION_KEY`).
  The same primitive also encrypts the OAuth CSRF state cookie
  (`src/lib/email/oauth-state.ts`) so it can't be forged or read
  client-side. See `PHASE5_REAL_EMAIL_INTEGRATION.md` §1.
- Secrets: environment variables only, loaded server-side. Nothing under
  `src/lib/ai/`, `src/lib/email/`, or `src/lib/auth/` is imported by a
  Client Component — enforced by keeping those modules free of `"use
  client"` boundaries and by not re-exporting secrets through props.

## 4. Audit logging

Every AI auto-applied change, every Accept/Reject of a suggested update,
every mailbox connect/disconnect, and every RBAC-relevant action (role
change, invite, removal) writes an `AuditLog` row: actor, action, entity,
before/after metadata, timestamp. The Audit Log screen (System →
Audit Log) is read-only and itself respects organization isolation.

## 5. AI data policy

- Customer email content is used solely to provide the extraction service
  to that organization — never used for model training or fine-tuning,
  never shared cross-tenant, never used as prompt few-shot examples for
  other customers.
- AI provider calls are made server-side through the `AIProvider`
  abstraction (`ARCHITECTURE.md` §3) so swapping vendors doesn't touch
  application code and doesn't require re-auditing data flow per page.
- **Disconnecting a mailbox revokes and discards its stored OAuth tokens
  immediately** (`EmailProvider.disconnect()` — encrypted access/refresh
  tokens are set to `null`, `connectionStatus` becomes `DISCONNECTED`) but
  deliberately does **not** cascade-delete the emails, extractions, deal
  events, or evidence that mailbox already produced. Deal facts a real
  human may have already reviewed and accepted — a stage change, a
  valuation update — stay intact and traceable; disconnecting stops future
  access, it doesn't retroactively corrupt the deal timeline. A genuine
  data-deletion request (e.g. an employee's account being fully
  offboarded) is a separate, explicit admin action, not an automatic
  side-effect of clicking Disconnect.

## 6. Webhook handling (Gmail push / Graph subscriptions — planned)

Webhook endpoints (`src/app/api/webhooks/*`) will verify provider
signatures/tokens before processing, respond quickly and process
asynchronously, and are idempotent against redelivery. Marked as **planned
integration** in this stage — no live subscriptions exist yet.

## 7. What is explicitly out of scope for v1

- SSO/SAML for enterprise IdPs beyond Google/Microsoft OAuth.
- Field-level encryption beyond OAuth tokens.
- Formal SOC2/ISO audit tooling (the audit log is a functional building
  block for one, not a compliance program).

## 8. Development data policy

No real confidential banking data is used anywhere in this repository.
The seeded dataset (`src/lib/data/fixtures/`, expanded by `prisma/seed.ts`
into the live Postgres database) is entirely fictional — company names,
deal values, and email content are invented for demonstration purposes
only. The dev database itself is local to this environment and is never a
target for real customer data.
