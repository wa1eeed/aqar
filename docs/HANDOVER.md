# HANDOVER — continuing the build from any Claude Code session

> Read this file first, then `CLAUDE.md`, then the technical documentation in `docs/technical/`
> (start at `docs/technical/README.md`), then the spec files (`docs/00` … `docs/11`).
> `docs/PROGRESS.md` is the per-phase checklist; `docs/QUESTIONS.md` holds every decision taken where
> the spec was silent or ambiguous (numbered — keep appending, never renumber).
> Last updated: end of **Phase 4**, start of **Phase 5** (bookings & payments).

---

## 1. Where the project stands

| Phase (docs/11) | Status | Merged to `main` |
|---|---|---|
| 0 — Foundations (monorepo, schema package, backend/admin skeletons, Docker, Caddy, CI) | ✅ done | yes |
| 1 — Auth & roles (staff 2FA, customer OTP, sessions, permissions, staff/roles/settings APIs, admin auth screens) | ✅ done | yes |
| 2 — Integrations (gateway, providers, email queue, nearby cache, admin integrations UI) | ✅ done | yes |
| 3 — Listings (properties, media pipeline, public API, demo seed, site on the API, admin properties UI) | ✅ done | yes |
| 4 — CRM & notifications (leads, viewings, customers, notification center, realtime, customer accounts) | ✅ done | yes |
| 5 — Bookings & payments | ⏳ **next** (nothing written yet) | — |
| 6 — Branding, licensing, SEO/AEO/GEO | pending | — |
| 7 — Reports, dashboard, audit screen, hardening | pending | — |
| 8 — Auctions (feature flag) | pending | — |

Acceptance results, test counts and per-task file locations for each finished phase are in
`docs/PROGRESS.md`.

### Working agreement with the owner (keep it)

- Reply to the owner **in Arabic**; code, comments, commits and docs in English (UI copy Arabic).
- Work on the session's development branch, commit per task with a conventional message
  (`feat(bookings): …`). **Merge to `main` only when the owner says so** — the pattern so far:
  finish a phase → run its acceptance checklist → update `PROGRESS.md`/`QUESTIONS.md` → report in
  Arabic → ask «هل أدمج في main وأبدأ المرحلة التالية؟».
- Never commit secrets: `backend/.env` and `infra/.env.*` are git-ignored (only `*.example` are tracked).
- No model names in code, commits or docs.
- When the spec is ambiguous: decide, implement, and record the decision in `docs/QUESTIONS.md`.

---

## 2. Repository map

```
packages/schema/   @nx/schema — SINGLE SOURCE OF TRUTH: property types, offers, statuses, fields,
                   cities, nearby categories (src/data.ts), helpers, zod spec builder, CRM labels
                   (src/crm.ts). `pnpm schema:frontend` regenerates frontend/assets/js/schema.js
                   (CI fails if it is stale). Backend imports the built dist → run
                   `pnpm --filter @nx/schema build` after editing it.
backend/           NestJS 10 API + worker (same image). Prisma 5 (PostgreSQL 16), Redis 7, BullMQ.
  prisma/          schema.prisma (from docs/01) + migrations (custom SQL in the init migration:
                   pg_trgm/unaccent, partial unique index `one_active_booking`, CHECK constraints)
  src/main.ts      HTTP API (prefix /api/v1) — src/bootstrap.ts holds all hardening (helmet, CSP,
                   body limits, trust proxy, Swagger in non-prod, Socket.IO Redis adapter)
  src/worker.ts    BullMQ workers: email, media, integrations (health/prune), crm (reminders,
                   saved-search digest, PDPL anonymisation)
  src/cli/         `node dist/cli/index.js <cmd>`: seed-demo, rotate-encryption-key; seed.ts = owner seed
  src/common/      auth guard/decorators/scopes, errors, rate limit, CSRF, security helpers, CSV
  src/modules/     one Nest module per domain (see §4)
  test/            e2e specs (supertest + socket.io-client + nock); unit specs live next to sources
admin/             React 18 + Vite 5 SPA served at /admin (RTL). Pages in src/pages, styles ported
                   from design/prototype/admin/admin.css into src/styles/admin.css
frontend/          The approved public site (vanilla JS). DO NOT redesign. New pages reuse
                   header/footer/cards from assets/js/ui.js.
  assets/js/       config.js · schema.js (generated) · api.js · ui.js · session.js (customer
                   session, login modal, bell, realtime client) · map.js · pages/*.js
  assets/css/      main.css (site tokens + Phase 4 header/login additions) · account.css
  account/         customer pages (index, viewings, notifications, saved-searches, settings)
  deploy/nginx.conf  legacy frontend-only container (current Coolify deployment)
infra/             docker-compose.yml (+ .dev.yml), Caddyfile, docker/Dockerfile, scripts, README
design/            screenshots (visual source of truth) + clickable prototype
spec-assets/       logos supplied with the spec (REGA, Ejar)
docs/              spec 00–11 + PROGRESS + QUESTIONS + this file
```

---

## 3. Running everything locally (no Docker)

Prerequisites: Node 20, pnpm 10, PostgreSQL 16, Redis 7.

```bash
pnpm install
cp backend/.env.example backend/.env        # fill secrets: openssl rand -base64 32 / 48
pnpm --filter @nx/schema build
cd backend && npx prisma migrate deploy && npx prisma generate
SEED_OWNER_PASSWORD='First-Login-Pass-2026' pnpm seed     # owner from SEED_OWNER_EMAIL (forced pwd change + 2FA)
pnpm build && node dist/cli/index.js seed-demo              # 26 demo listings (ids 1001…) + 3 agents; refuses production
pnpm dev                                                    # API on :3000
node dist/worker.js                                         # worker (emails, media, jobs)
cd ../admin && pnpm dev                                     # admin on :5173 (proxies /api and /ws)
```
The public site is static: serve `frontend/` behind the same origin as the API (Caddy does this
in Docker). Without the API the site falls back to the bundled demo data automatically.

**Full stack with Docker** (same images as production): see `infra/README.md`
(`docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --env-file infra/.env.dev up --build`
→ http://localhost:8080, `/admin`, `/api/v1/health`).

Development emails: with no Resend integration configured, `NODE_ENV=development` prints every email
(OTP codes included) to the API log (`[dev email]`); `test` keeps them in memory
(`EmailService.captured`); staging/production mark them failed — codes never reach logs there.

### Tests and checks (all must pass before a commit)

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm -r test            # schema (vitest) + backend (jest: unit + e2e) + admin (vitest)
pnpm --filter @nx/schema check:frontend
```
Backend e2e needs PostgreSQL + Redis: by default `postgresql://nx:nx_dev_password@localhost:5432/nx_test`
and `redis://localhost:6379/15` (override with `TEST_DATABASE_URL` / `TEST_REDIS_URL`). Each suite
calls `resetDb()` (test/auth-helpers.ts) — **add every new table to it** or suites leak into each other.
Current count: 216 tests (schema 10, backend 197, admin 9).

---

## 4. Backend architecture (what exists and where)

| Module | Responsibility | Notes |
|---|---|---|
| `auth` | Staff login + mandatory TOTP for owner/admin/finance, recovery codes, invites, password reset, re-auth window; customer email OTP + registration (PDPL consent); refresh-token rotation with family revocation | Access JWT 15 min in memory (admin) / sessionStorage (site); refresh in httpOnly cookie (`nx_srt` staff, `nx_rt` customer, path `/api/v1/auth`). **30 s rotation grace window** (QUESTIONS #39). |
| `common/auth` | Default-deny `AuthGuard`; decorators `@Public`, `@Staff(...perms)`, `@Customer`, `@Authenticated`, `@RecentAuth`; `AccessScopeService` row scopes ("own" for agents) | Out-of-scope rows return **404**, not 403. |
| `staff`, `settings` | Staff/roles CRUD; 13 settings sections validated by zod (`settings/schemas/*.ts`), cached, audited | Settings keys = docs/07 §10. |
| `integrations` | `IntegrationsGateway.run()` — circuit breaker, token bucket, retries (idempotent only), timeouts, SSRF guard, redacted call logs; providers in `providers/*.ts`; secrets AES-256-GCM, write-only, masked | **Never call third parties outside the gateway.** Moyasar has only settings + connection test so far. |
| `email` | Outbox → BullMQ → Resend; `sendTemplate` (otp, invites…) and `sendNotification` (event emails, brand footer, admin overrides) | Templates: `email/templates.ts`. |
| `properties`, `media`, `locations`, `public`, `nearby` | Listings CRUD with schema-driven specs (relaxed draft / strict publish), publish rules, status history; R2 presigned uploads + sharp variants; public API (cached in Redis, versioned key `pub:ver`); nearby via gateway | `invalidatePublic()` **before** emitting property events. |
| `leads`, `viewings` | Public leads (round-robin, idempotency), CRM (board, stages, assign, activities, manual, export), viewings (calendar, confirmation, conflicts on confirmed only), `GET /admin/assignees` | |
| `customers` | Admin customers (list/profile/block/PDPL export) and `/me` (profile + email verification, favorites, saved searches, viewings, export, deletion → anonymised after 30 days by a job) | |
| `notifications` | `NotificationsService.dispatch()` (channels from settings + preferences, locked events, in-app + Socket.IO push, deduplicated email), `NotificationRules` (@OnEvent listeners, docs/06 table), `CrmJobsService` (reminders, digest), centers for staff and customers | **To add an event:** emit it after the DB transaction, add a handler in `notification-rules.ts`, keep keys from `events/event-catalog.ts`. |
| `realtime` | Socket.IO at `/ws` (gateway), Redis adapter (API) + Redis emitter (`RealtimeService`, usable from the worker) | Rooms: `public`, `property:{id}`, `customer:{id}`, `staff`, `staff:{id}`, `role:{key}`. Origin check, connection rate limit, disconnect at token expiry and on `revokeAll`. Payloads minimal. |
| `webhooks` | Resend (Svix signature) with idempotent `WebhookEvent` | Moyasar webhook to add in Phase 5. |
| `audit` | `AuditService.record()` — call inside the same transaction as the change | Every booking/payment/property/lead state change must be audited. |

Conventions that matter:
- **Money is halalas (BigInt)** everywhere in the DB and API; the public property payload keeps
  `price` in SAR for the old frontend (`priceHalalas` alongside). JSON serialises BigInt via
  `common/http/json.ts`.
- DTOs: `createZodDto(zodSchema)` with `.strict()`; free text through `plainText(max)` (strips
  control chars/HTML); rich text through `richText` (sanitize-html allow-list).
- Errors: `throw new AppException(CODE, httpStatus, 'Arabic message', { fields })` → shape
  `{ error: { code, message, details, correlationId } }`. Zod messages (English defaults) are
  translated in the admin by `fieldMessage()`.
- Rate limits: `@RateLimit({ name, limit, windowSec, by: 'ip' | 'body:<field>' })` (Redis sliding window).
- Lists: `{ items, total, page, pageSize, pages }`.
- Numbers like `L-000123`, `B-2026-000123`, `R-2026-000123`: `nextCounter(tx, key)` (`common/counter.ts`).

---

## 5. Admin panel (admin/)

Routes in `src/app/App.tsx` (each wrapped in `Gate permission=…`; unbuilt sections render
`PlaceholderPage` — add the path to `BUILT` when a section is done). API client `src/lib/api.ts`
(memory token, silent refresh, re-auth prompt, `download()` for CSV/JSON). Realtime:
`src/lib/realtime.tsx` (`useRealtimeEvent(event, fn)`). Shared labels come from `@nx/schema`
(aliased to the package source in Vite/TS). Built screens: login/2FA/invite/reset, staff, roles,
integrations (+ detail), properties (+ editor with map, uploads, licence, SEO preview), settings →
locations, leads (kanban + drawer), viewings (calendar), customers, notifications (+ bell, broadcast,
preferences). Styles: `src/styles/{tokens,base,admin}.css` — reuse prototype classes (`panel2`,
`tbl`, `pill p-*`, `kpi2`, `drawer2`, `cmp`, `steps2`, `notifs`, `kanban`, `cal`).

## 6. Public site (frontend/)

Every page script runs inside `MZ.boot().then(...)` (loads `/api/v1/public/config` + `/schema`,
falls back to mock data). `ui.mount(active)` renders header/footer and calls `MZ.auth.init()`.
`session.js` provides `MZ.auth` (request with silent refresh, login modal `openLogin()`,
`mountLogin()` for inline use) and `MZ.rt` (Socket.IO client loaded lazily from `/ws/socket.io.js`;
`MZ.rt.on(event, fn)`, `MZ.rt.subscribe(propertyId)`). Property URLs `/property/{id}-{slug}`;
clean URLs (no `.html`) in Caddy and nginx; `/account` maps to `account/index.html`.

## 7. Infrastructure

- `infra/Caddyfile`: `/api/*` and `/ws*` → api:3000; `/admin/*` SPA (strict CSP, `connect-src`
  allows R2 for uploads); public site CSP; private files blocked; clean-URL redirects; property
  and account rewrites. Any new third-party origin (e.g. Moyasar form script/frame) must be added
  to the CSP here **and** documented.
- Images: `infra/docker/Dockerfile` targets `api` (API + worker + CLI), `frontend-static`,
  `admin-static`. CI (`.github/workflows/ci.yml`) runs lint/format/typecheck/migration-drift/tests
  and builds images.
- Current production: Coolify deploys the **frontend only** (Base Directory `/frontend`, nginx).
  To go live with the backend Coolify must switch to Docker Compose (`infra/docker-compose.yml`) —
  steps in `infra/README.md`. Cloudflare R2 bucket needs the CORS rule documented there.

---

## 8. Phase 5 plan (bookings & payments) — where to start

Spec: `docs/04-bookings-payments.md`, API `docs/02 §5–7`, screens `a-bookings`, `a-booking-detail`,
`a-payments`, `a-transfers`, `a-settings-booking`, `a-settings-bank`, `c-checkout-*`, `c-booking-*`,
`c-bookings`, `m-checkout`, `m-booking-bank`.

Already in place: Prisma models (`Booking`, `Payment`, `PaymentEvent`, `BankAccount`,
`BankTransferSubmission`), partial unique index `one_active_booking`, `Property.bookingEnabled` and
`paymentPolicy`, settings schemas `booking`, `payments`, `bank_transfer` (with defaults), Moyasar
integration settings + connection test, event keys and email template keys in the catalog,
customer accounts + notifications + realtime.

Planned order (tasks):
1. **Booking core** — pure quote calculation (fixed/percent/min/max, rent period, per-property
   override, method availability = settings ∧ integration ready ∧ policy); create inside a
   transaction with `SELECT … FOR UPDATE` on the property + the unique index → `409
   BOOKING_PROPERTY_UNAVAILABLE`; state machine with property side effects + `PropertyStatusHistory`
   + audit + events; hold-expiry job; `/me/bookings*` and `/admin/bookings*`; `booking` block in the
   public property payload.
2. **Payments** — Moyasar adapter inside the gateway (invoice + embedded form, fetch, refund, webhook
   verification); `PaymentsService.reconcile()` (row lock, idempotent, amount/currency/metadata
   check, anomaly → `payment.anomaly`); `/webhooks/moyasar`; `/me/payments/:id/verify`; 5-minute
   reconcile job; refunds; bank accounts CRUD with IBAN mod-97; transfer upload (multipart, magic-byte
   check, private storage) and admin review; receipts (number + Arabic PDF rendered by headless
   Chromium in the worker); Rize adapter stub; notification rules for `booking.*` / `payment.*`.
3. **Admin UI** — bookings list/detail, payments, transfer review, settings booking/payments/bank.
4. **Site** — «احجز العقار» on the property page, `booking.html` (2 steps), `account/bookings`,
   `account/booking` (timeline, pay again, transfer instructions + upload, receipt, cancel, live).
5. **Acceptance** (docs/11): Moyasar sandbox payment confirms + reserves; concurrent booking → 409;
   transfer approve/reject notify the customer; expired holds release.

Known constraint of the build sandbox: outbound access to moyasar.com/resend.com was blocked, so
provider HTTP details are implemented from the documented API and tested with recorded responses
(nock). Verify with sandbox keys before go-live (QUESTIONS #21).

---

## 9. Documentation (continuous)

- Technical guides: `docs/technical/*.md` — update the affected guide with every change.
- Generated reference: `pnpm run docs` writes `docs/technical/reference/*` from the code (endpoints with
  permissions, environment, roles, events, settings defaults, error codes, data model); CI runs
  `pnpm docs:check`. An endpoint without a JSDoc description makes `pnpm run docs` fail.
- `CHANGELOG.md`: one line per change under **Unreleased**.

## 10. Tips for a fresh session

- Services: `pg_ctlcluster 16 main start` (or your own Postgres), `redis-server --daemonize yes`.
- After editing `packages/schema`: `pnpm --filter @nx/schema build` (backend uses `dist`), and
  `pnpm schema:frontend` if public lists changed.
- After editing `prisma/schema.prisma`: create a migration (`npx prisma migrate dev --name …`, or
  `prisma migrate diff --from-migrations … --to-schema-datamodel …` in non-interactive shells) and
  keep `resetDb()` in `test/auth-helpers.ts` in sync.
- Browser checks: Playwright is available; serve the stack through Caddy (`infra/Caddyfile`) so
  `/api`, `/ws`, `/admin` and the site share one origin. The owner account forces a password change
  and 2FA on first login; for scripted tests create a `sales_manager` (no mandatory 2FA).
- Commit per task, push to the session branch, update `PROGRESS.md` at the end of each phase.
