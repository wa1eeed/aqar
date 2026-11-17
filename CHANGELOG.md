# Changelog

All notable changes to the platform. Format: [Keep a Changelog](https://keepachangelog.com/);
phases follow `docs/11-implementation-plan.md`. Every change adds a line under **Unreleased**; a
phase merged into `main` becomes a section. Details per phase: `docs/PROGRESS.md`.

## [Unreleased]

_Nothing yet — Phase 6 (branding, licensing, SEO/AEO/GEO) in progress._

## Phase 5 — Bookings & payments (2026-11-17)

### Added
- Booking quote rules (`backend/src/modules/bookings/quote.ts`): fixed/percent deposit with min/max,
  rent period, per-property policy override, payment-method availability; unit tests.
- Bookings: quote, creation with row lock + one-active-booking index (409 for the loser), state machine
  with property side effects and history, customer cancel/pay again, admin confirm/complete/cancel/
  extend hold, hold-expiry job, `booking` block in the public property payload.
- Payments: Moyasar invoice/embedded flows, server-side reconcile (webhook → queue, callback, 5-minute
  job) with amount/currency/metadata checks and anomaly alerts, refunds; bank transfers with receipt
  upload (byte-level type check), review approve/reject; bank accounts with IBAN mod-97 validation.
- Receipts: number `R-YYYY-NNNNNN`, Arabic PDF rendered in the worker (embedded IBM Plex Sans Arabic),
  emailed as an attachment, downloadable by the customer and staff; Chromium added to the API image.
- Email attachments supported end to end (outbox → queue → Resend).
- Notifications for `booking.*` and `payment.*` events; live `booking.updated` / `payment.updated`.
- Moyasar payment operations in the integrations gateway (`gateway.payments()`): hosted invoice,
  fetch invoice/payment, refund, webhook verification (`secret_token`).
- Technical documentation set `docs/technical/` (architecture, backend, admin, frontend, security,
  operations, integrations, testing, contributing) and the generated reference
  (`docs/technical/reference/`: API endpoints, environment, permissions, events, settings, error codes,
  data model) with `pnpm run docs` / `pnpm docs:check` (CI). Every API endpoint now carries a description.
- `docs/HANDOVER.md` for continuing the build from any session.
- Admin: bookings list and detail, payments (month totals, refunds, reconcile), bank transfer review,
  settings sections with tabs (booking & payment methods with live example, bank transfer with
  accounts and customer preview, cities moved under the tabs), «المدفوعات» counter for transfers under
  review; `GET /admin/payments/methods-status`.
- Site: «احجز العقار» on the property page, checkout `/booking#p-{id}` (deposit/full, payment methods,
  bank accounts preview, terms, idempotent creation, Moyasar redirect or embedded form), «حجوزاتي» and
  the booking page (bank transfer with countdown and receipt upload, pay/retry, review state, confirmed
  with receipt PDF download, cancel, live updates), account overview with active bookings.
- API: the quote returns the bank accounts when bank transfer is offered; `GET /me/bookings/:id`
  returns the next payment action (read-only).
- Booking and payment labels generated into the site's `schema.js` from `@nx/schema`.

### Security
- Site CSP allows Moyasar's form stylesheet and images (`cdn.moyasar.com`).

### Fixed
- The API image failed to start: the transfer upload imported `multer`, which is not a direct
  dependency (memory storage is now the interceptor default).
- Admin tables no longer widen the page on phones (scroll inside the table).
- Documentation command is `pnpm run docs` (`pnpm docs` runs pnpm's built-in command); generated
  descriptions no longer stop at "e.g.".

## Phase 4 — CRM & notifications (2026-11-17)

### Added
- Notification pipeline (in-app, live push, deduplicated email with brand footer), rules for the
  docs/06 events, staff and customer notification centers, preferences, team broadcast.
- Socket.IO `/ws` with Redis adapter/emitter, rooms, origin check, connection limits, disconnect on
  expiry and revocation.
- Leads (board, stages with lost reason, assignment, activities, manual leads, link customer, CSV
  export), viewings calendar with confirmation and conflict check, customers admin, `/me` APIs
  (profile with email verification, favorites, saved searches, viewings, export, deletion).
- Worker jobs: viewing reminders, saved-search digest, PDPL anonymisation.
- Admin: leads kanban + drawer, viewings calendar, customers, notification center, live bell.
- Site: email-code login, header bell and account menu, account pages, favorites sync, saved searches,
  live property status.

### Security
- Refresh-token rotation grace window (30 s) so parallel tabs are not treated as token theft.
- Confirming a viewing checks the agent's confirmed schedule.

## Phase 3 — Listings (2026-11-17)

### Added
- Properties CRUD with schema-driven specs, publish rules, status history, duplicate, bulk actions;
  locations; media pipeline (R2 presigned uploads, sharp variants, EXIF removal).
- Public API matching the existing frontend contract; demo seed (26 listings); site switched to the
  API with mock fallback; `/property/{id}-{slug}` URLs; client-side Overpass removed.
- Admin: property list, editor (map picker, uploads, licence, SEO preview, history, autosave),
  cities and districts settings.

## Phase 2 — Integrations (2026-11-17)

### Added
- `IntegrationsGateway` (circuit breaker, rate limits, retries, timeouts, SSRF guard, redacted call
  logs), encrypted provider credentials, generated admin forms, health checks.
- Providers: OSM, Overpass, Google Maps/Places, Resend (+ webhook), Cloudflare R2, Moyasar settings;
  prepared: Rize, REGA, Ejar, Nafath, Nafith, SMS providers. Email queue; nearby cache;
  `rotate-encryption-key` CLI.

## Phase 1 — Auth & roles (2026-11-17)

### Added
- Staff authentication (argon2id, lockout, mandatory TOTP for privileged roles, recovery codes,
  invites, password reset, re-authentication window), customer email OTP with PDPL consent,
  rotating refresh tokens with family revocation, default-deny authorization with row scopes,
  staff/roles/settings APIs, admin auth and team screens.

## Phase 0 — Foundations (2026-11-16)

### Added
- pnpm monorepo, `@nx/schema` (single source of truth, generated `schema.js`), NestJS + Prisma
  backend skeleton with the full schema, admin skeleton, Docker Compose stack, Caddy, CI, backup
  scripts.

## Before the build (2026-11-14 – 2026-11-16)

- Static frontend deployed on Coolify with clean URLs; repository restructured to the spec layout.
