# HANDOVER — continuing the build from any Claude Code session

> Read this file first, then `CLAUDE.md`, then the technical documentation in `docs/technical/`
> (start at `docs/technical/README.md`), then the spec files (`docs/00` … `docs/11`).
> `docs/PROGRESS.md` is the per-phase checklist; `docs/QUESTIONS.md` holds every decision taken where
> the spec was silent or ambiguous (numbered — keep appending, never renumber).
> Last updated: end of **Phase 5** (bookings & payments), start of **Phase 6** (branding, licensing, SEO).

---

## 0. Start here — checklist for a new session (any Claude Code account)

1. Read, in order: this file → `CLAUDE.md` → `docs/technical/README.md` (then the guide for the area
   you will touch) → the spec files for the current phase (`docs/11` tells which) → `docs/PROGRESS.md`
   (what is done, test counts) → `docs/QUESTIONS.md` (decisions already taken — do not re-decide them).
2. Check the branch: work on the session's development branch; `main` holds every merged phase
   (Phase 0–5 today). `git log --oneline -10` shows the latest work; `CHANGELOG.md` summarises it.
3. Bring the environment up (§3.1: PostgreSQL, Redis, `.env`, migrations, seed) and run the full check
   (§3.2). **Everything must be green before you change anything** — if not, fix the environment first.
4. Pick up the next phase from §8 (the plan names the spec sections, screenshots and the task order).
5. For every task: code + tests + docs in the same commit (§9 and `CLAUDE.md` "Definition of done");
   at the end of a phase run its acceptance checklist, update `PROGRESS.md`, this file and
   `CHANGELOG.md`, report to the owner in Arabic and ask before merging (§1 working agreement).

Nothing important lives outside the repository: helper scripts used for browser checks are described
in `docs/technical/testing.md` (§ Browser checks), sandbox Docker builds in §10 below.

---

## 1. Where the project stands

| Phase (docs/11) | Status | Merged to `main` |
|---|---|---|
| 0 — Foundations (monorepo, schema package, backend/admin skeletons, Docker, Caddy, CI) | ✅ done | yes |
| 1 — Auth & roles (staff 2FA, customer OTP, sessions, permissions, staff/roles/settings APIs, admin auth screens) | ✅ done | yes |
| 2 — Integrations (gateway, providers, email queue, nearby cache, admin integrations UI) | ✅ done | yes |
| 3 — Listings (properties, media pipeline, public API, demo seed, site on the API, admin properties UI) | ✅ done | yes |
| 4 — CRM & notifications (leads, viewings, customers, notification center, realtime, customer accounts) | ✅ done | yes |
| 5 — Bookings & payments (quote, locking, state machine, Moyasar, bank transfer, refunds, receipts, admin + site screens) | ✅ done | yes |
| 6 — Branding, licensing, SEO/AEO/GEO | ⏳ **next** | — |
| 7 — Reports, dashboard, audit screen, hardening | pending | — |
| 8 — Auctions (feature flag) | pending | — |

Acceptance results, test counts and per-task file locations for each finished phase are in
`docs/PROGRESS.md`.

### Open items carried forward (do not lose them)

| Item | Why it is open | Where it is tracked |
|---|---|---|
| Live check of Resend, Moyasar (payment + refund + webhook) and Google with sandbox keys | Build sandbox could not reach the providers; adapters tested with recorded responses | QUESTIONS #21, #53 |
| Moyasar embedded-form version `1.14.0` | Could not confirm the latest version | QUESTIONS #53, `frontend/assets/js/session.js` |
| Rize (rent instalments) adapter | Awaiting the partner's API documentation; the checkout hides Rize until it is ready | QUESTIONS #51, `providers/rize.ts` |
| REGA, Ejar, Nafath, Nafith integrations | Prepared (settings only), awaiting credentials/documentation; `nafathRequiredAbove` blocks bookings above the threshold if set | docs/05, QUESTIONS |
| SMS provider choice (Unifonic / Taqnyat / Msegat) | Awaiting the company's choice; SMS preferences stored, nothing sent | QUESTIONS #24, #34 |
| REGA badge in the checkout summary, footer licensing badges | Phase 6 (licensing settings) | QUESTIONS #52, §8 |
| Production deployment of the backend | Coolify still deploys only `frontend/`; switch to Docker Compose | §7, `infra/README.md`, `docs/technical/operations.md` |
| Confirm the open decisions with the owner | Every decision in `docs/QUESTIONS.md` was taken to keep going and awaits confirmation | `docs/QUESTIONS.md` |

### Working agreement with the owner (keep it)

- Reply to the owner **in Arabic**; code, comments, commits and docs in English (UI copy Arabic).
- Work on the session's development branch, commit per task with a conventional message
  (`feat(bookings): …`). **Merge to `main` only when the owner says so** — the pattern so far:
  finish a phase → run its acceptance checklist → update `PROGRESS.md`/`QUESTIONS.md` → report in
  Arabic → ask «هل أدمج في main وأبدأ المرحلة التالية؟».
- Never commit secrets: `backend/.env` and `infra/.env.*` are git-ignored (only `*.example` are tracked).
- No model names in code, commits or docs.
- When the spec is ambiguous: decide, implement, and record the decision in `docs/QUESTIONS.md`.
- **Documentation is continuous and must stay professional and complete** (explicit request of the
  owner): every change updates the affected guide in `docs/technical/`, regenerates the reference
  (`pnpm run docs`) and adds a `CHANGELOG.md` line, so any technical team — or another Claude Code
  account — can continue without this conversation.
- Security first: default-deny routes, server-side amounts/statuses, secrets encrypted and never
  returned, CSP for every new origin, audit + events for every state change (see `docs/technical/security.md`).
- Report format at the end of a phase: what now works, acceptance results, issues found and fixed,
  what remains before go-live, then the merge question.

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
                   saved-search digest, PDPL anonymisation), payments (reconcile, reconcile-pending,
                   expire-holds, receipt PDFs)
  src/cli/         `node dist/cli/index.js <cmd>`: seed-demo, rotate-encryption-key; seed.ts = owner seed;
                   docs.ts = generator of docs/technical/reference (`pnpm run docs`)
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
  booking.html     checkout (/booking#p-{id}) — script pages/booking.js
  account/         customer pages (index, bookings, booking, viewings, notifications, saved-searches,
                   settings) — one script: pages/account.js
  deploy/nginx.conf  legacy frontend-only container (current Coolify deployment)
infra/             docker-compose.yml (+ .dev.yml), Caddyfile, docker/Dockerfile, scripts, README
design/            screenshots (visual source of truth) + clickable prototype
spec-assets/       logos supplied with the spec (REGA, Ejar)
docs/              spec 00–11 + PROGRESS + QUESTIONS + this file
  technical/       professional technical documentation (guides) + reference/ (generated, CI-checked)
CHANGELOG.md       one line per change; a section per merged phase
```

---

## 3. Running everything locally (no Docker)

Prerequisites: Node 20, pnpm 10, PostgreSQL 16, Redis 7 (all present in the Claude Code cloud image;
Chromium for receipts is at `/opt/pw-browsers/chromium`).

### 3.1 Fresh container bootstrap (copy-paste)

```bash
pg_ctlcluster 16 main start          # or: service postgresql start
redis-server --daemonize yes
sudo -u postgres psql -c "CREATE ROLE nx LOGIN PASSWORD 'nx_dev_password' CREATEDB;"   # skip if it exists
for db in nx nx_test nx_shadow; do sudo -u postgres createdb -O nx $db; done              # skip existing ones
```
`backend/.env` (git-ignored) — start from `backend/.env.example`; required secrets:
`openssl rand -base64 32` for `APP_ENCRYPTION_KEY`, `openssl rand -base64 48` for the JWT secrets;
set `SEED_OWNER_EMAIL`, `NODE_ENV=development`, `PUBLIC_URL` = the origin you browse from
(e.g. `http://127.0.0.1:8090` with the nginx recipe in `docs/technical/testing.md`) and
`CHROMIUM_PATH=/opt/pw-browsers/chromium`. Full list: `docs/technical/reference/environment.md`.

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

### 3.2 Tests and checks (all must pass before a commit)

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm -r test            # schema (vitest) + backend (jest: unit + e2e) + admin (vitest)
pnpm --filter @nx/schema check:frontend
pnpm docs:check         # generated reference up to date (run `pnpm run docs` to regenerate)
```
Receipt tests render a PDF: export `CHROMIUM_PATH=/opt/pw-browsers/chromium` before `pnpm -r test`.
Backend e2e needs PostgreSQL + Redis: by default `postgresql://nx:nx_dev_password@localhost:5432/nx_test`
and `redis://localhost:6379/15` (override with `TEST_DATABASE_URL` / `TEST_REDIS_URL`). Each suite
calls `resetDb()` (test/auth-helpers.ts) — **add every new table to it** or suites leak into each other.
Current count: 240 tests (schema 10, backend 221, admin 9).

---

## 4. Backend architecture (what exists and where)

| Module | Responsibility | Notes |
|---|---|---|
| `auth` | Staff login + mandatory TOTP for owner/admin/finance, recovery codes, invites, password reset, re-auth window; customer email OTP + registration (PDPL consent); refresh-token rotation with family revocation | Access JWT 15 min in memory (admin) / sessionStorage (site); refresh in httpOnly cookie (`nx_srt` staff, `nx_rt` customer, path `/api/v1/auth`). **30 s rotation grace window** (QUESTIONS #39). |
| `common/auth` | Default-deny `AuthGuard`; decorators `@Public`, `@Staff(...perms)`, `@Customer`, `@Authenticated`, `@RecentAuth`; `AccessScopeService` row scopes ("own" for agents) | Out-of-scope rows return **404**, not 403. |
| `staff`, `settings` | Staff/roles CRUD; 13 settings sections validated by zod (`settings/schemas/*.ts`), cached, audited | Settings keys = docs/07 §10. |
| `integrations` | `IntegrationsGateway.run()` — circuit breaker, token bucket, retries (idempotent only), timeouts, SSRF guard, redacted call logs; providers in `providers/*.ts`; secrets AES-256-GCM, write-only, masked | **Never call third parties outside the gateway.** Payments facade: `gateway.payments()` (Moyasar invoice, fetch, refund, webhook secret; Rize not ready). |
| `email` | Outbox → BullMQ → Resend; `sendTemplate` (otp, invites…) and `sendNotification` (event emails, brand footer, admin overrides) | Templates: `email/templates.ts`. |
| `properties`, `media`, `locations`, `public`, `nearby` | Listings CRUD with schema-driven specs (relaxed draft / strict publish), publish rules, status history; R2 presigned uploads + sharp variants; public API (cached in Redis, versioned key `pub:ver`); nearby via gateway | `invalidatePublic()` **before** emitting property events. |
| `leads`, `viewings` | Public leads (round-robin, idempotency), CRM (board, stages, assign, activities, manual, export), viewings (calendar, confirmation, conflicts on confirmed only), `GET /admin/assignees` | |
| `customers` | Admin customers (list/profile/block/PDPL export) and `/me` (profile + email verification, favorites, saved searches, viewings, export, deletion → anonymised after 30 days by a job) | |
| `notifications` | `NotificationsService.dispatch()` (channels from settings + preferences, locked events, in-app + Socket.IO push, deduplicated email), `NotificationRules` (@OnEvent listeners, docs/06 table), `CrmJobsService` (reminders, digest), centers for staff and customers | **To add an event:** emit it after the DB transaction, add a handler in `notification-rules.ts`, keep keys from `events/event-catalog.ts`. |
| `realtime` | Socket.IO at `/ws` (gateway), Redis adapter (API) + Redis emitter (`RealtimeService`, usable from the worker) | Rooms: `public`, `property:{id}`, `customer:{id}`, `staff`, `staff:{id}`, `role:{key}`. Origin check, connection rate limit, disconnect at token expiry and on `revokeAll`. Payloads minimal. |
| `webhooks` | Resend (Svix signature) with idempotent `WebhookEvent`; Moyasar (`secret_token`) in `payments.controller.ts` | Webhooks never change state directly: they queue a reconcile. |
| `bookings` | `quote.ts` (pure rules), `BookingsService` (quote, create with row lock + `one_active_booking` index → 409, customer/admin actions, hold expiry), `BookingTransitions` (state machine + property side effects + history + audit) | Change a booking status **only** through `BookingTransitions.apply()`. |
| `payments` | `PaymentsService` (start, reconcile = server re-fetch with amount/currency/metadata checks, markPaid → receipt number, refunds), `TransfersService` (upload with byte-level type check, review), `ReceiptsService` (Arabic PDF via headless Chromium in the worker), `FileStore` (private R2; `backend/.uploads` in dev/test) | Never mark paid from a browser or webhook body. |
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
integrations (+ detail), properties (+ editor with map, uploads, licence, SEO preview), leads (kanban +
drawer), viewings (calendar), customers, notifications (+ bell, broadcast, preferences), bookings (+
detail), payments, transfer review, settings with section tabs (`pages/settings/SettingsLayout.tsx`:
booking & payment methods, bank transfer, cities). Wrap tables in `div.tbl-wrap`. Styles: `src/styles/{tokens,base,admin}.css` — reuse prototype classes (`panel2`,
`tbl`, `pill p-*`, `kpi2`, `drawer2`, `cmp`, `steps2`, `notifs`, `kanban`, `cal`).

## 6. Public site (frontend/)

Every page script runs inside `MZ.boot().then(...)` (loads `/api/v1/public/config` + `/schema`,
falls back to mock data). `ui.mount(active)` renders header/footer and calls `MZ.auth.init()`.
`session.js` provides `MZ.auth` (request with silent refresh, login modal `openLogin()`,
`mountLogin()` for inline use) and `MZ.rt` (Socket.IO client loaded lazily from `/ws/socket.io.js`;
`MZ.rt.on(event, fn)`, `MZ.rt.subscribe(propertyId)`). Property URLs `/property/{id}-{slug}`;
clean URLs (no `.html`) in Caddy and nginx; `/account` maps to `account/index.html`.
Bookings: «احجز العقار» on the property page → `/booking#p-{id}` (`pages/booking.js`) →
`/account/booking?b={id}` (`pages/account.js`, also `/account/bookings`). `MZ.auth.request` accepts
`FormData` and `headers`; `MZ.auth.download()` saves receipt PDFs; `MZ.payments.moyasarForm()` loads
Moyasar's embedded form. Booking/payment labels: `MZ.schema.bookingStatuses` etc. (generated).

## 7. Infrastructure

- `infra/Caddyfile`: `/api/*` and `/ws*` → api:3000; `/admin/*` SPA (strict CSP, `connect-src`
  allows R2 for uploads); public site CSP; private files blocked; clean-URL redirects; property
  and account rewrites. Any new third-party origin must be added to the CSP here **and** documented
  (Moyasar: script/style/img `cdn.moyasar.com`, connect `api.moyasar.com`, frame `*.moyasar.com`).
- The `api` image installs Chromium (receipt PDFs, `CHROMIUM_PATH=/usr/bin/chromium`).
- Images: `infra/docker/Dockerfile` targets `api` (API + worker + CLI), `frontend-static`,
  `admin-static`. CI (`.github/workflows/ci.yml`) runs lint/format/typecheck/migration-drift/tests
  and builds images.
- Current production: Coolify deploys the **frontend only** (Base Directory `/frontend`, nginx).
  To go live with the backend Coolify must switch to Docker Compose (`infra/docker-compose.yml`) —
  steps in `infra/README.md`. Cloudflare R2 bucket needs the CORS rule documented there.

---

## 8. Phase 6 plan (branding, licensing, SEO/AEO/GEO) — where to start

Spec: docs/11 Phase 6, docs/07 (settings «الهوية والمظهر», «التراخيص والاعتمادات», SEO screens),
docs/08 §1–4 and §10–11 (theme bootstrap, footer licensing badges, property page quick answer, FAQ,
licence section), screens `a-settings-brand*`, `a-settings-licensing`, `a-seo*`, `c-property-rent`,
`c-home-site`.

Already in place: settings sections `branding`, `contact`, `licensing`, `seo` (schemas with defaults),
property fields for licence numbers and SEO, public config endpoint (`/public/config`), Caddy routes
reserved for SEO paths.

Suggested order:
1. **Branding & theme** — settings screen with live preview and contrast guard; `/theme.css`
   generated from the settings (cached, versioned), favicon pipeline; site and admin read it without
   a flash of unstyled content.
2. **Licensing** — settings screen; footer badges (REGA, Ejar) and property-page licence section;
   add the REGA badge to the checkout summary (QUESTIONS #52).
3. **SEO module** — global settings, templates, keywords, landing pages, FAQ manager, quick-answer
   summary, JSON-LD, SSR meta for property/landing routes, sitemaps, robots (AI crawler toggles),
   `llms.txt`, feed, redirects + 404 log, page score, OG images, consent-gated analytics.
4. **Acceptance** (docs/11): primary colour change visible on site and admin after refresh without
   FOUC; Rich Results Test passes for a property page; robots/llms.txt reflect the settings.

Before go-live (carried over from Phase 5): run a real Moyasar sandbox payment and refund, and check
the embedded form version (QUESTIONS #21, #53).

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
- **Docker in a restricted sandbox** (Claude Code cloud): start the daemon with `nohup dockerd &`. OS
  package mirrors are blocked there, so build from a derived Dockerfile: copy `infra/docker/Dockerfile`,
  add after `FROM ${NODE_IMAGE} AS deps` the lines `COPY --from=ccr ca-bundle.crt
  /usr/local/share/ca-certificates/sandbox.crt`, `ENV NODE_EXTRA_CA_CERTS=…/sandbox.crt` and
  `ARG HTTPS_PROXY HTTP_PROXY NO_PROXY`; use `node:20-bookworm` for the `api` stage; drop the
  `apt-get` RUN block (so no Chromium/tini in that test image) and the tini ENTRYPOINT. Build each
  target with `docker buildx build --network host --build-context ccr=/root/.ccr --build-arg
  HTTPS_PROXY=$HTTPS_PROXY --build-arg HTTP_PROXY=$HTTPS_PROXY -f <derived> --target <api|admin-static|frontend-static>
  -t nx/<api|admin|frontend>:latest --load .`, then `docker compose -f infra/docker-compose.yml -f
  infra/docker-compose.dev.yml --env-file infra/.env.dev up -d --no-build` (create `infra/.env.dev`
  from `infra/.env.example`). Production images are built by CI with the real Dockerfile.
- Receipt PDFs need Chromium: locally set `CHROMIUM_PATH=/opt/pw-browsers/chromium` (the Playwright
  browser) for the worker and the backend tests.
- Browser checks: Playwright is available; serve the site and the API on one origin (nginx recipe
  in `docs/technical/testing.md`, or the Docker stack through Caddy) so `/api`, `/ws` and the site
  share it; the admin can run on Vite (`:5173`, proxies `/api` and `/ws`). The owner account forces a password change
  and 2FA on first login; for scripted tests create a `sales_manager` (no mandatory 2FA).
- Commit per task, push to the session branch, update `PROGRESS.md` at the end of each phase.
