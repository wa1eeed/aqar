# CLAUDE.md — NX Real Estate Platform (single-company edition)

You are implementing the backend, the admin panel and the remaining frontend work for a real-estate
platform that one real-estate company (or brokerage office) runs on its own server.
The public frontend already exists in `frontend/` and is approved: **do not redesign it**.

Read these files completely, in this order, before writing any code:

1. `docs/00-overview.md`            — scope, architecture, stack, repository layout
2. `docs/01-data-model.md`          — the full Prisma schema (source of truth for the database)
3. `docs/02-api.md`                 — every REST endpoint and every WebSocket event
4. `docs/03-auth-roles.md`          — staff roles, permissions matrix, customer accounts
5. `docs/04-bookings-payments.md`   — booking journey, deposit/full payment, Moyasar, bank transfer, Rize
6. `docs/05-integrations.md`        — the API Gateway, provider adapters, admin-configurable integrations
7. `docs/06-notifications.md`       — notification centers (admin + customer), events catalog, Resend email
8. `docs/07-admin-panel.md`         — every admin screen and every settings section
9. `docs/08-frontend-changes.md`    — exact changes to the existing public frontend
10. `docs/09-auctions.md`           — advanced-package module (build last, behind a feature flag)
11. `docs/10-security-ops.md`       — security, PDPL, deployment, backups, observability, testing
12. `docs/11-implementation-plan.md`— phases, task order and acceptance criteria
13. `design/SCREENS.md`             — screenshot of every admin and customer screen + clickable prototype
14. `docs/12-multi-tenancy.md`      — multi-tenant architecture + super-admin (overrides "single company")
15. `docs/13-entitlements.md`       — subscription packages: the Entitlement Engine (3 layers)

## Visual source of truth

`design/screenshots/` (50 screens: admin panel, customer account, checkout, mobile) and the clickable
prototype in `design/prototype/` show exactly how every new screen must look. Before building a screen,
open its screenshot from `design/SCREENS.md` and match it: layout, components, labels, Arabic copy, states.
Port the component styles from `design/prototype/admin/admin.css` and `design/prototype/account/account.css`.
Behaviour comes from `docs/`; appearance comes from the screenshots.

## Non-negotiable rules

- **Multi-tenant SaaS (see `docs/12-multi-tenancy.md`, which overrides older "single company" wording).**
  The platform hosts many real-estate offices (tenants) centrally. A super-admin (`PlatformAdmin`)
  manages tenant subscriptions, plans and domains. **Within each tenant** it stays single-office: there
  is no vendor/owner self-registration and no third party publishes listings — the office's staff create
  every listing; its customers only browse, save, request and book. Every tenant-owned row carries
  `tenantId`; isolation is shared-DB + `tenantId` + Postgres RLS, enforced in app (tenant-scoped Prisma
  extension) and DB. Per-tenant unique codes `PREFIX-YY-XXXX`. R2 is one platform bucket, folder
  `tenants/{tenantId}/…` per tenant.
- **Three separate layers — never conflate them (`docs/13-entitlements.md`).** Capabilities (what the
  code can do — `FEATURE_CATALOG`), Entitlements (what a tenant's subscription allows — `PlanEntitlement`
  + `TenantEntitlement`, resolved by `EntitlementsService`, enforced by `@RequireFeature` / `assertWithinLimit`),
  and Permissions (RBAC — `Role.permissions`). Build each feature once and gate it by a capability key
  (`seo.advanced`), never `if (plan === 'pro')`. Enforce entitlements centrally on the server.
- **The approved frontend is the design.** Match its tokens (`frontend/assets/css/main.css`), fonts,
  spacing, components and RTL behaviour exactly in every new page, including the admin panel.
  New public pages reuse the existing header/footer/card components from `frontend/assets/js/ui.js`.
- **`packages/schema` is the single source of truth** for property types, offers, statuses, fields,
  cities and nearby categories. Backend validation, the admin property form and the public
  frontend (`frontend/assets/js/schema.js`, generated) all derive from it. Never duplicate these lists.
- **Never call a third-party API from controllers or from the browser** (map tiles and the Moyasar
  card form are the only exceptions, see 05). Every external call goes through `IntegrationsGateway`.
- **All integration credentials are editable from the admin panel**, stored encrypted (AES-256-GCM),
  never returned to the browser after saving (masked `••••1234`), with "Test connection" and call logs.
- **Money is stored in halalas as integers** (`BigInt`/`Int`), never floats. Currency is SAR.
- **Server is the authority** for prices, amounts and payment status. Never trust amounts or statuses
  sent by a browser; always re-fetch from the provider before marking a payment as paid.
- **Every state change of a booking, payment, property status or lead is written to `AuditLog`** and
  emits the domain event listed in `docs/06-notifications.md`.
- **Arabic first.** All customer-facing and admin UI copy is Arabic (RTL). Use the strings given in the
  docs verbatim. Dates shown in Gregorian with Latin digits, prices formatted `en-US` + `ر.س`.
- Do not invent features, fields or providers that are not in these documents. If something is
  ambiguous, stop and write the question in `docs/QUESTIONS.md`, then continue with other tasks.

## Working conventions

- TypeScript strict mode everywhere. ESLint + Prettier. No `any` unless commented.
- Backend: NestJS modules per domain (see 00). DTOs validated with `zod` (via `nestjs-zod`).
- Database changes only via Prisma migrations. Seed script must produce a working demo (see 11).
- Every endpoint documented with OpenAPI decorators; Swagger UI at `/api/docs` (staff-only in prod).
- Every module ships unit tests for its services and e2e tests for its controllers.
- Commit per completed task with a conventional message (`feat(bookings): …`).
- After each phase, run the phase's acceptance checklist in `docs/11-implementation-plan.md` and
  tick it in `docs/PROGRESS.md` (create it).

## Definition of done (per task)

1. Code compiles, lint passes, tests pass (`pnpm -r test`).
2. API matches `docs/02-api.md` exactly (paths, payloads, status codes, error shape).
3. UI matches its screenshot in `design/screenshots/` and the copy in the docs; works at 390px and 1440px wide.
4. Permissions enforced server-side according to `docs/03-auth-roles.md`.
5. Audit log + domain events emitted where the docs require them.
