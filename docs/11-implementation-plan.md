# 11 — Implementation Plan & Acceptance Criteria

Work strictly phase by phase. Do not start a phase before the previous checklist passes. Record
progress in `docs/PROGRESS.md`. Questions go to `docs/QUESTIONS.md`.

## Phase 0 — Foundations
- pnpm monorepo, `packages/schema` (port + `build:frontend` + sync test), backend skeleton (NestJS,
  Prisma schema from 01 + 07 §13 additions, migrations, seed), admin skeleton (Vite React RTL, tokens),
  Docker Compose dev + prod, Caddyfile, CI pipeline, health endpoints, error filter, correlation ids,
  audit service, encryption service, settings module with all zod section schemas + defaults.
- ✅ `docker compose up` gives `/`, `/admin`, `/api/v1/health` working locally.
- ✅ Generated `frontend/assets/js/schema.js` is byte-for-byte equivalent in behaviour (existing pages
  still work with mock data).

## Phase 1 — Identity & staff
- Staff auth (login, refresh rotation, 2FA, forgot/reset), roles & permissions guard + scopes, staff
  CRUD + invite email, customer OTP auth, `/auth/me`.
- ✅ Owner must set 2FA on first login. ✅ Agent cannot read another agent's leads (e2e).

## Phase 2 — Integrations gateway, storage, email
- Gateway core (resolution, encryption, retries, breaker, logs, health job), providers: `maps.osm`,
  `places.overpass`, `maps.google`, `places.google`, `email.resend`, `storage.r2`; prepared stubs for
  `payments.rize`, `gov.rega`, `gov.ejar`, `identity.nafath`, `gov.nafith`, `sms.*`.
- Admin integrations UI (generated forms, test connection, logs).
- ✅ Changing the Resend API key in admin takes effect without restart. ✅ Secrets never appear in API
  responses or logs (test). ✅ Nearby served from cache on second call.

## Phase 3 — Listings
- Locations, properties CRUD with schema-driven specs validation, media pipeline (presign → R2 →
  sharp variants → CDN), status changes + history, publish rules (license required), public property
  endpoints matching the current frontend contract, stats, similar, search (`q`).
- Admin property list/editor (all tabs), districts management.
- Frontend: `MZ.boot()`, API mode, `/property/:id-:slug` URLs, removal of client Overpass.
- ✅ All existing public pages work against the API with seeded data, identical look.
- ✅ Agent can create/edit only own listings; publish blocked without ad license.

## Phase 4 — CRM & notifications
- Leads (public endpoint, routing, kanban, activities), viewings calendar, customers admin, favorites &
  saved searches API, notification service + centers (admin + customer), preferences, Resend templates,
  Socket.IO realtime (rooms/events in 02 §9), live property status on public pages.
- Frontend: login modal, header bell/avatar menu, `account/` pages (index, viewings, notifications,
  settings, saved searches), favorites sync.
- ✅ Submitting a viewing request shows a notification in the agent's admin within 2 s and sends an
  email. ✅ Customer receives `viewing.confirmed` in-app + email after admin confirmation.

## Phase 5 — Bookings & payments
- Settings booking/payments/bank transfer + bank accounts, quote, booking creation with locking,
  Moyasar adapter (invoice + embedded modes), webhook + callback reconcile, expiry & reconcile jobs,
  bank transfer upload/review, refunds, receipts PDF, property status side-effects, Rize stub wired.
- Frontend: `booking.html`, `account/bookings.html`, `account/booking.html`.
- ✅ Moyasar sandbox payment confirms the booking and reserves the property. ✅ Concurrent booking →
  409. ✅ Bank transfer approve/reject flows notify the customer. ✅ Expired holds release correctly.

## Phase 6 — Branding, licensing, SEO/AEO/GEO
- Branding & theme settings + `/theme.css` generator + favicon pipeline + live preview + contrast
  guard; licensing settings + footer/property badges with REGA/Ejar logos.
- SEO module: global settings, templates, keywords library, landing pages (+ suggestions), FAQ manager,
  quick-answer summary, JSON-LD (Organization/RealEstateAgent, WebSite+SearchAction, BreadcrumbList,
  RealEstateListing, FAQPage, HowTo), SSR meta for property/landing routes, sitemaps, robots with AI
  crawler policy, `llms.txt`, feed, redirects & 404 log, per-page score, OG image generation,
  consent-gated analytics.
- ✅ Changing the primary colour in admin updates the public site and admin after refresh, no FOUC.
- ✅ Rich Results Test passes for a property page (RealEstateListing + Breadcrumb + FAQ).
- ✅ `robots.txt` reflects AI crawler toggles; `/llms.txt` serves edited content.

## Phase 7 — Hardening & launch
- Reports & CSV exports, audit viewer, system status card, backups + restore test, Lighthouse CI,
  Playwright suite, security review checklist (10 §1), PDPL docs, staging → production runbook in
  `docs/RUNBOOK.md`.
- ✅ All tests green; Lighthouse thresholds met; restore test documented.

## Phase 8 — Auctions (only when the company enables the advanced package)
- docs/09 in full behind `features.auctions`.

## Seed (all environments)
Owner from env, system roles, cities/districts from schema, default settings for every section
(including the current brand values from `frontend/assets/js/config.js`), integration registry rows,
email template defaults, SEO defaults (templates, FAQ examples for booking/viewing). Staging also seeds
the 26 demo listings and three demo agents.
