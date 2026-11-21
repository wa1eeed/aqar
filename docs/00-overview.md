# 00 — Overview & Architecture

## 1. Product scope

A self-hosted real-estate platform for **one** Saudi real-estate company:

| Surface | Users | Purpose |
|---|---|---|
| Public website (`frontend/`, exists) | Visitors | Browse/filter listings, map, property pages, leads |
| Customer account "حسابي" (new pages in `frontend/`) | Registered customers | Bookings, payments, viewings, favorites, notifications, profile |
| Admin panel (`admin/`, new) | Company staff | Listings, leads, customers, bookings, payments, notifications, settings, integrations |
| API + WebSocket (`backend/`, new) | All of the above | Business logic, persistence, real-time, integrations |

Out of scope: owner/vendor self-service (within a tenant), mobile apps, ZATCA e-invoicing (phase 2,
see 10 §9).

> **Multi-tenant update (see `docs/12-multi-tenancy.md`).** The platform is now a multi-tenant SaaS:
> many real-estate offices (tenants) are hosted centrally, each with its own site (path / subdomain /
> custom domain), isolated data (`tenantId` + Postgres RLS), and a tenant-scoped admin panel. A new
> super-admin surface (`/super`) manages tenant subscriptions, plans and domains. The tables below
> describe one tenant's surfaces; add a platform layer above them.

## 2. Architecture

```
                         ┌──────────────────────── VPS (Docker Compose) ────────────────────────┐
 Browser ── HTTPS ──►  Caddy (TLS, HTTP/2, gzip/brotli)                                           │
                         │  /             → frontend (static)                                     │
                         │  /property/*   → api  (SSR meta + JSON-LD, then static page)           │
                         │  /admin/*      → admin (static SPA)                                    │
                         │  /api/*        → api  (NestJS REST)                                    │
                         │  /ws           → api  (Socket.IO, upgraded)                            │
                         │                                                                        │
                         │  api (NestJS) ──► PostgreSQL 16                                         │
                         │      │        ──► Redis 7 (cache, BullMQ queues, Socket.IO adapter)     │
                         │      │                                                                  │
                         │      └─ IntegrationsGateway ──► Moyasar · Resend · Cloudflare R2 ·      │
                         │                                 OSM/Overpass · Google Maps/Places ·      │
                         │                                 Ejar · REGA · Nafath · Nafith · Rize ·   │
                         │                                 SMS (optional)                           │
                         │  worker (same image, `node dist/worker`) ─ BullMQ consumers              │
                         └────────────────────────────────────────────────────────────────────────┘
 Media: browser ──(presigned PUT)──► R2 private bucket "uploads" → worker resizes → R2 public bucket
        "media" served from https://cdn.<domain>
```

## 3. Stack (fixed)

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 LTS, pnpm workspaces |
| API | NestJS 10, TypeScript strict, `nestjs-zod`, `@nestjs/swagger`, Pino logger |
| DB | PostgreSQL 16 + Prisma 5 (+ `pg_trgm`, `unaccent` extensions) |
| Cache / queues | Redis 7, BullMQ, `@socket.io/redis-adapter` |
| Real-time | Socket.IO 4 (namespace `/ws`) |
| Auth | Argon2id passwords, JWT access (15 min) + rotating refresh token (httpOnly cookie), TOTP 2FA for staff |
| Files | Cloudflare R2 via `@aws-sdk/client-s3` + presigned URLs, `sharp` for variants |
| Email | Resend (`resend` SDK) + RTL HTML templates (`react-email` components compiled at build) |
| Admin UI | React 18 + Vite + TypeScript, React Router, TanStack Query, React Hook Form + zod, Socket.IO client. Styling: CSS modules using the tokens from `frontend/assets/css/main.css` (copy tokens to `admin/src/styles/tokens.css`). No UI kit that changes the look. |
| Public UI | Existing vanilla JS in `frontend/` (keep it vanilla) |
| Proxy / TLS | Caddy 2 |
| Deploy | Docker Compose on one Linux VPS (Ubuntu 22.04+), GitHub Actions build & deploy |

## 4. Repository layout (create exactly)

```
/
├─ CLAUDE.md
├─ docs/                       (this specification)
├─ frontend/                   (existing public site — extend, do not redesign)
├─ admin/                      (React admin SPA, built to admin/dist, served at /admin)
├─ backend/
│  ├─ prisma/schema.prisma     (from docs/01)
│  ├─ prisma/seed.ts
│  └─ src/
│     ├─ main.ts  worker.ts
│     ├─ common/               (guards, interceptors, filters, pagination, money, audit)
│     ├─ modules/
│     │  ├─ auth/  users/  customers/  roles/
│     │  ├─ properties/  media/  locations/  agents/
│     │  ├─ leads/  viewings/  favorites/  saved-searches/
│     │  ├─ bookings/  payments/  bank-transfer/
│     │  ├─ notifications/  email/  realtime/
│     │  ├─ settings/  integrations/  (gateway + providers/*)
│     │  ├─ seo/  stats/  audit/  auctions/ (flagged)
│     └─ jobs/                 (BullMQ processors)
├─ packages/
│  └─ schema/                  (shared TS source of truth; builds frontend/assets/js/schema.js)
└─ infra/
   ├─ docker-compose.yml  Caddyfile  .env.example
   └─ scripts/ (backup.sh, restore.sh, deploy.sh)
```

## 5. Shared schema package (`packages/schema`)

Port `frontend/assets/js/schema.js` to TypeScript **without changing any key, label or option**:

- `offers`, `statuses`, `closedStatuses`, `categories`, `types`, `rentPeriods`, `cities`, `fieldGroups`,
  `fields`, `nearby`, helpers `fieldsFor(type, offer)`, `statusesFor(offer)`, `isClosed(status)`.
- Export `buildSpecsZod(type, offer)` that returns a zod object validating `Property.specs`
  (number → `z.number().nonnegative()`, money → integer halalas, select → `z.enum(options)`,
  bool → `z.boolean()`, text → `z.string().max(120)`, date → ISO date; `required` fields enforced).
- `pnpm --filter schema build:frontend` writes `frontend/assets/js/schema.js` (IIFE that sets
  `window.MZ.schema`, identical public surface to the current file). Add a header comment
  "GENERATED — edit packages/schema". CI fails if the generated file is stale.
- Cities and districts are seeded into the DB from this package; afterwards the admin can add
  districts (see 07). The public API returns the merged list from the DB.

## 6. Environments & domains

| Env | Domain | Notes |
|---|---|---|
| production | `https://<company-domain>` | admin at `/admin`, API at `/api`, CDN `https://cdn.<company-domain>` |
| staging | `https://staging.<company-domain>` | same compose file, `NODE_ENV=staging`, provider sandbox keys |
| local | `http://localhost:8080` | `docker compose -f infra/docker-compose.dev.yml up` |

## 7. Glossary (use these names in code)

| Arabic | Code |
|---|---|
| عقار | `Property` |
| إعلان / رقم ترخيص الإعلان | `adLicense` |
| رخصة فال | `falLicense` |
| طلب (تواصل/معاينة/عرض عقار) | `Lead` |
| موعد معاينة | `Viewing` |
| حجز عقار | `Booking` |
| عربون | `deposit` |
| دفعة / عملية دفع | `Payment` |
| تحويل بنكي | `BankTransfer` |
| عميل | `Customer` |
| موظف / مستشار | `StaffUser` (role `agent`) |
| إشعار | `Notification` |
| تكامل | `Integration` |
| مزاد | `Auction` |
