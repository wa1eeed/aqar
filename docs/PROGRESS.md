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

## Phase 1 — Identity & staff — next
