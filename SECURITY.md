# Tattava — Security Model

Investment banking data is treated as highly confidential by default —
undisclosed deal terms, client relationships, and valuations are
market-moving information.

## 1. Authentication

- Auth.js (NextAuth v5) with **Google OAuth** and **Microsoft Entra ID
  OAuth** only. No password auth, no credential storage — Tattava never
  requests or stores a user's mailbox password.
- Session strategy: database-backed sessions (not stateless JWT) so a
  session can be revoked server-side (forced sign-out, deprovisioned org
  member) without waiting for token expiry.
- OAuth client secrets and NextAuth secret are read from environment
  variables only (`GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`,
  `AUTH_SECRET`) — never committed, never hardcoded. `.env.example`
  documents required variables with placeholder values only.

## 2. Authorization / organization isolation

- Every tenant-scoped table carries `organizationId`. Every repository
  method requires an `organizationId` argument and every Prisma query
  filters on it — there is no "list all deals" code path that omits the
  tenant filter.
- Role-based access control via `OrganizationMember.role`
  (`OWNER/ADMIN/BANKER/ANALYST/VIEWER`): write actions (accept/reject AI
  suggestions, edit deal fields, connect mailboxes) require `BANKER` or
  above; `VIEWER` is read-only; org administration requires `ADMIN`/`OWNER`.
- Team scoping (`M&A`, `ECM`, `DCM`, …) is a filter, not a hard security
  boundary in v1 — documented as a planned refinement if cross-team
  confidentiality walls are required (e.g. restructuring ethical walls).

## 3. Data protection

- Encryption in transit: HTTPS everywhere (enforced at the hosting/edge
  layer); OAuth tokens and API calls to Gmail/Graph/Anthropic/OpenAI are
  TLS-only.
- Encryption at rest: relies on the managed Postgres provider's at-rest
  encryption; OAuth refresh tokens stored in `EmailAccount` are additionally
  application-encrypted (planned: `ENCRYPTION_KEY`-based envelope
  encryption before the live email integration ships).
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
- Evidence excerpts are retained only as long as the source `EmailAccount`
  connection is active; disconnecting a mailbox cascades deletion of its
  emails, extractions, and evidence.

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
Demo Mode data (`src/lib/data/fixtures/`) is entirely fictional — company
names, deal values, and email content are invented for demonstration
purposes only.
