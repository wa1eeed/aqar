# Progress

Phases and acceptance criteria from `docs/11-implementation-plan.md`. Open questions: `docs/QUESTIONS.md`.

## Phase 0 — Foundations ✅

| Item | Status | Where |
|---|---|---|
| pnpm monorepo, TypeScript strict, ESLint, Prettier | ✅ | `package.json`, `tsconfig.base.json`, `eslint.config.mjs` |
| `packages/schema` port + `build:frontend` + sync test | ✅ | `packages/schema` — generated `frontend/assets/js/schema.js` is tested for identical data and helper behaviour against the original file, and for staleness |
| `buildSpecsZod(type, offer)` | ✅ | `packages/schema/src/specs-zod.ts` (unknown fields rejected, money = integer halalas) |
| Prisma schema (docs/01 + 07 §13), migrations | ✅ | `backend/prisma` — listing ids from 1001, full-text search, one-active-booking index, integrity CHECK constraints |
| Seed (idempotent) | ✅ | `backend/src/cli/seed.ts` — roles, 6 cities / 38 districts, 13 settings sections, 15 integrations, SEO defaults, owner from env |
| Backend skeleton (NestJS 10), `main.ts` + `worker.ts` | ✅ | `backend/src` |
| Health endpoints | ✅ | `GET /api/v1/health`, `GET /api/v1/ready` |
| Error filter (docs/02 §1 shape, Arabic messages) + correlation ids | ✅ | `common/errors`, `common/context` |
| Audit service | ✅ | `modules/audit` (redacted, transaction-aware) |
| Encryption service (AES-256-GCM, AAD, key rotation) | ✅ | `modules/crypto` |
| Settings module: zod schema + defaults for all 13 sections | ✅ | `modules/settings` (cached, audited, cross-instance invalidation) |
| Admin skeleton (Vite React RTL, tokens) | ✅ | `admin/` — layout from the prototype, nav per docs/07 §1, 390 px → 1440 px |
| Docker Compose dev + prod, Caddyfile | ✅ | `infra/` |
| CI pipeline | ✅ | `.github/workflows/ci.yml` (lint, format, types, migrations drift, tests with Postgres/Redis, audit, images → GHCR) |
| Backup / restore / deploy scripts | ✅ | `infra/scripts` (backup + restore test verified) |

### Acceptance

- ✅ `docker compose up` gives `/`, `/admin`, `/api/v1/health` working locally — verified on a fresh
  database: all services healthy; `/` 200, `/admin/` → login, `/api/v1/health` `{"status":"ok"}`.
- ✅ Generated `frontend/assets/js/schema.js` behaves identically — unit test against the original file;
  every public page opened in Chromium through Caddy with no JS errors or CSP violations and the same
  listing counts as before (home 19, listings 24, rent 18, property page 8).

### Security baseline delivered in Phase 0

- Default-deny: every API route requires authentication unless explicitly `@Public()`.
- Rate limits (Redis sliding window, per IP or per hashed body field, fail-closed option), CSRF header
  guard for cookie endpoints, strict validation (unknown fields rejected), HTML sanitising, safe URLs
  (no `javascript:`), hex-only colours, curated fonts (no CSS injection in the future `theme.css`).
- Guard against oversized JSON (arrays > 1000, depth > 32) ahead of validation.
- Errors never expose stack traces, SQL or provider responses; logs redact credentials and cookies.
- Security headers: HSTS, CSP (site + stricter admin), nosniff, frame DENY, referrer and permissions policies.
- Containers: only Caddy exposed; Postgres/Redis on an internal network, Redis password; API/worker
  non-root, read-only filesystem, no capabilities. Secrets only in env (validated at boot: weak or
  missing values refuse to start).
- Hidden files and internal docs (`*.md`, dotfiles, build files) are not served.

### Tests

74 automated tests: schema 10, backend 62 (unit + e2e on PostgreSQL and Redis), admin 2.

## Phase 1 — Identity & staff ✅

| Item | Status | Where |
|---|---|---|
| Staff login (Argon2id, lockout 15 min after 10 failures, per-IP limit) | ✅ | `modules/auth/staff-auth.service.ts` |
| Refresh rotation (14 d staff / 30 d customers), reuse → family revoked + `security.session_revoked` | ✅ | `modules/auth/session.service.ts` |
| 2FA: TOTP (RFC 6238, replay-protected), mandatory for owner/admin/finance, QR + 10 hashed recovery codes | ✅ | `modules/auth/totp.ts` |
| Forced password change + 2FA setup on the seeded owner's first login | ✅ | login challenge steps |
| Forgot / reset (30 min link), staff invite (72 h link) | ✅ | email outbox (`EmailLog`), delivery via Resend in Phase 2 |
| Re-authentication window (10 min) for staff/role changes and payment settings | ✅ | `@RecentAuth()`, `POST /auth/staff/reauth` |
| Roles & permissions guard + row-level scopes | ✅ | `common/auth` (`@Staff(...)`, `AccessScopeService`) |
| Staff CRUD + invite, reset 2FA, custom roles | ✅ | `modules/staff` |
| Customer OTP auth (email), registration with PDPL consent, optional password | ✅ | `modules/auth/customer-auth.service.ts` |
| `/auth/me`, `/auth/refresh`, `/auth/logout` | ✅ | `modules/auth/auth.controller.ts` |
| Settings endpoints per section permission | ✅ | `modules/settings/settings.controller.ts` |
| Admin UI: login, 2FA, setup, recovery codes, forgot/reset, invite, team, roles, re-auth dialog | ✅ | `admin/src` |

### Acceptance

- ✅ **Owner must set 2FA on first login** — e2e `auth-staff.e2e-spec.ts` (password change → 2FA setup →
  tokens only after both) and verified in Chromium through Caddy on the Docker stack.
- ✅ **Agent cannot read another agent's leads** — e2e: list returns only assigned leads, another
  agent's lead answers 404; the owner sees all.

### Security covered by tests

Replayed TOTP codes and recovery codes rejected; challenge destroyed after 5 wrong codes; identical
errors for unknown email vs wrong password; account lockout; per-IP and per-destination rate limits;
stolen refresh token reuse revokes the whole session; CSRF header required for cookie endpoints;
forged/tampered JWTs rejected; deactivation and password reset kill live tokens immediately; admins
cannot touch the owner; last owner cannot be removed; customers cannot reach staff routes or use a
customer cookie as a staff session; OTP codes, recovery codes and tokens stored only as keyed hashes;
no secrets in API responses or the audit log.

### Tests

124 automated tests: schema 10, backend 112, admin 2.

## Phase 2 — Integrations gateway, storage, email ✅

| Item | Status | Where |
|---|---|---|
| Gateway core: resolution, AES-256-GCM secrets (bound to the key), 60 s cache + Redis invalidation, timeouts, retries with backoff + jitter (idempotent only), circuit breaker (5 failures → 60 s, health down), token-bucket rate limit, redacted call logs | ✅ | `modules/integrations/gateway.service.ts`, `integration-store.service.ts` |
| SSRF guard on every provider call (public https only, no redirects, no private/metadata IPs) | ✅ | `assertPublicHttpsUrl` |
| Providers: `maps.osm`, `places.overpass`, `maps.google`, `places.google`, `email.resend`, `storage.r2` | ✅ | `providers/*` |
| `payments.moyasar` settings screen + connection test (payment flows: Phase 5) | ✅ | `providers/moyasar.ts` |
| Prepared: `payments.rize`, `gov.rega`, `gov.ejar`, `identity.nafath`, `gov.nafith`, `sms.unifonic/taqnyat/msegat` | ✅ | `providers/prepared.ts` |
| Health job every 15 min, `integration.health_changed`, call-log pruning (30 days) | ✅ | `worker.ts` |
| Email through BullMQ worker (5 attempts, 1 min → 1 h), Resend webhook (Svix signature, idempotent) | ✅ | `modules/email`, `modules/webhooks` |
| Nearby via gateway, `NearbyCache` (30 days) + Redis; `GET /public/properties/:id/nearby` | ✅ | `modules/nearby` |
| `pnpm cli rotate-encryption-key --new <key>` (atomic) | ✅ | `cli/rotate-encryption-key.ts` |
| Admin integrations UI: grid (a-integrations.png) + generated detail forms (a-integration-moyasar.png), test, enable, environment, logs | ✅ | `admin/src/pages/Integration*` |

### Acceptance

- ✅ **Changing the Resend API key in admin takes effect without restart** — e2e: email sent with key A,
  key changed through the admin API, next email sent with key B (same process).
- ✅ **Secrets never appear in API responses or logs** — e2e checks the admin view (hints only), call
  logs, audit log and stored config; the encrypted column does not contain the plaintext.
- ✅ **Nearby served from cache on the second call** — e2e: first call hits Overpass, second call makes
  no HTTP request (network disabled in the test), and the DB cache survives a Redis flush.

Verified on the Docker stack: worker starts, schedules the health and prune jobs, and updates health.

### Tests

164 automated tests: schema 10, backend 152, admin 2.

## Phase 3 — Listings — ✅ done

| Task | Status | Where |
|---|---|---|
| Locations: cities (activate, order, coordinates), districts CRUD; inline «إضافة حي» from the editor | ✅ | `modules/locations`, `admin/src/pages/LocationsPage.tsx` |
| Properties CRUD, schema-driven specs (relaxed for drafts, strict on publish), derived fields, slug | ✅ | `modules/properties` |
| Status changes + history, publish/unpublish, duplicate, soft delete, bulk actions — all audited + events | ✅ | `properties.service.ts` |
| Publish rules: ad license + FAL licence + valid expiry + ≥1 photo + required specs | ✅ | `property-rules.ts` `publishProblems` |
| Agents see/edit only their own listings (row scope), editors/managers all | ✅ | `AccessScopeService` |
| Media: presign → R2 PUT → complete → sharp variants (480/960/1920, JPEG+WebP, EXIF stripped), reorder, cover, alt text, video links | ✅ | `modules/media`, `worker.ts` |
| Public API matching the frontend contract: config, schema, list/search (`q`), detail, similar, stats, agents, nearby, leads | ✅ | `modules/public` |
| Demo seed: the 26 listings + 3 agents of the original mock (`seed-demo`, refuses production) | ✅ | `cli/seed-demo.ts` |
| Frontend: `MZ.boot()`, API mode with mock fallback, `/property/:id-:slug`, client Overpass removed | ✅ | `frontend/assets/js` |
| Admin: property list (filters, bulk publish, CSV export), editor (all tabs, map picker, uploads, licence, SEO preview, history, autosave) | ✅ | `admin/src/pages/Propert*` |

### Acceptance

- ✅ **All existing public pages work against the API with seeded data, identical look** — browser
  comparison of every page in API mode vs the original mock data, through the production Docker
  images: 0.00% pixel difference on all pages; all 26 listings return identical data.
  The only difference is the order of equally-ranked "similar" cards (see QUESTIONS #26).
- ✅ **Agent can create/edit only own listings; publish blocked without ad license** — e2e tests
  (403/404 on another agent's listing; publish returns `PUBLISH_BLOCKED` listing what is missing).
  Also checked in the browser: new draft → «قبل النشر» lists missing licence/photos/specs.

### Tests

186 automated tests: schema 10, backend 177 (86 unit + 91 e2e), admin 9.

## Phase 4 — CRM & notifications — ✅ done

| Task | Status | Where |
|---|---|---|
| Notification pipeline: channels from settings + preferences (locked events), in-app + live push, deduplicated emails with brand footer and admin overrides | ✅ | `modules/notifications` |
| Rules for the docs/06 events available so far (leads, viewings, property status/price, saved searches, integrations, bounces, security) | ✅ | `notification-rules.ts` |
| Socket.IO `/ws`: rooms of docs/02 §9, Redis adapter + emitter (API and worker), origin check, connection rate limit, disconnect on token expiry and on revocation | ✅ | `modules/realtime` |
| Leads: list, kanban board, detail, stage (lost reason), assign, activities, manual lead, link/create customer, CSV export (re-auth) | ✅ | `modules/leads` |
| Viewings: calendar API, create/edit, confirmation → customer, conflict check on confirmed viewings | ✅ | `modules/viewings` |
| Customers admin (list, profile, block, PDPL export) and `/me` (profile + email verification, favorites, saved searches, viewings, notifications, preferences, export, deletion) | ✅ | `modules/customers` |
| Jobs: viewing reminders (24 h / 2 h), daily saved-search digest, PDPL anonymisation after 30 days | ✅ | `crm-jobs.service.ts`, `worker.ts` |
| Admin: leads kanban + drawer, viewings calendar, customers, notification center, live bell, broadcast, preferences | ✅ | `admin/src/pages/{Leads,LeadDrawer,Viewings,Customers,Notifications}*` |
| Site: login modal (email code), header bell + account menu, `account/*` pages, favorites sync, saved searches, live property status | ✅ | `frontend/assets/js/session.js`, `frontend/account/`, `pages/account.js` |

### Acceptance

- ✅ **A viewing request shows a notification in the agent's admin within 2 s and sends an email** —
  e2e test over a real Socket.IO connection (asserts < 2 s, one email to the agent, nothing leaked to
  another agent). In the browser through Caddy: the admin board and bell update live.
- ✅ **The customer receives `viewing.confirmed` in-app + email after admin confirmation** — e2e
  (live `notification.new` + `notification.count`, email row, notification center). In the browser:
  the customer's bell updated 32–41 ms after the manager confirmed.

Also verified on the Docker stack: `/ws` through Caddy, a foreign `Origin` is refused (403), the
worker schedules the reminder, digest and anonymisation jobs.

### Tests

216 automated tests: schema 10, backend 197 (unit + e2e), admin 9.

## Phase 5 — Bookings & payments — ✅ done

| Task | Status | Where |
|---|---|---|
| Settings booking / payments / bank transfer + bank accounts (IBAN mod-97), payment-method readiness | ✅ | `settings/schemas`, `payments/iban.ts`, `payments.controller.ts` |
| Quote (fixed/percent deposit with min/max, rent period, per-property override, method availability), creation with row lock + `one_active_booking` index, idempotency | ✅ | `bookings/quote.ts`, `bookings.service.ts` |
| State machine with property side effects + status history + audit + events; customer cancel / pay again; admin confirm / complete / cancel / extend hold | ✅ | `booking-transitions.ts`, `bookings.service.ts` |
| Moyasar adapter (hosted invoice + embedded form, fetch, refund, webhook `secret_token`), reconcile (webhook → queue, callback, 5-minute job) with amount/currency/metadata checks and anomaly alerts | ✅ | `integrations/providers/moyasar.ts`, `payments.service.ts` |
| Bank transfer upload (byte-level type check, private storage) and review; refunds (card via Moyasar, manual for transfers) | ✅ | `transfers.service.ts`, `payments.controller.ts` |
| Receipts: `R-YYYY-NNNNNN`, Arabic PDF (headless Chromium, embedded font), emailed, downloadable | ✅ | `receipts.service.ts`, worker `payments` queue |
| Hold expiry job, Rize stub (not ready → hidden), notifications for `booking.*` / `payment.*`, live `booking.updated` / `payment.updated` | ✅ | `worker.ts`, `notifications/booking-rules.ts` |
| Admin: bookings + detail, payments, transfer review, settings tabs (booking & payment methods, bank transfer), payments counter | ✅ | `admin/src/pages/{Bookings,BookingDetail,Payments,Transfers}Page.tsx`, `pages/settings/` |
| Site: «احجز العقار», `booking.html` checkout, `account/bookings.html`, `account/booking.html` (transfer upload, pay/retry, receipt, cancel, live) | ✅ | `frontend/booking.html`, `pages/booking.js`, `pages/account.js` |

### Acceptance

- ✅ **Moyasar sandbox payment confirms the booking and reserves the property** — e2e against recorded
  Moyasar responses: hosted invoice → webhook (verified, stored once, queued) → callback re-fetch →
  paid → confirmed → property reserved; repeats idempotent; amount mismatch → failed + finance alert.
  ⚠️ A real sandbox transaction was not possible from the build environment (moyasar.com blocked):
  run one with sandbox keys before go-live (QUESTIONS #21, #53).
- ✅ **Concurrent booking → 409** — e2e fires two creations at once: one 201, one
  `409 BOOKING_PROPERTY_UNAVAILABLE`.
- ✅ **Bank transfer approve/reject notify the customer** — e2e (notification + email for both); in the
  browser the customer's booking page switched to «تم تأكيد حجزك» live after the approval, and the
  receipt PDF downloaded.
- ✅ **Expired holds release correctly** — e2e: the job expires unpaid bookings, the property stays
  available, the customer is told; bookings awaiting transfer review wait for the reviewer.

Also verified: full customer flow in the browser at 1440 px and 390 px (no horizontal scroll, no page
errors); admin screens at both widths; Docker stack (migrations, API/worker healthy, payment job
schedulers registered, CSP allows the Moyasar form).

### Tests

240 automated tests: schema 10, backend 221 (unit + e2e), admin 9.

## Phase 6 — Branding, licensing, SEO/AEO/GEO — next
