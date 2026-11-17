# Testing

## Layers

| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Schema package | vitest | `packages/schema/test` | Helpers, zod spec builder, generated `schema.js` equals the original contract |
| Backend unit | jest | `backend/src/**/*.spec.ts` | Pure logic: TOTP, encryption, redaction, phone, property rules, booking quote, … |
| Backend e2e | jest + supertest + socket.io-client + nock | `backend/test/*.e2e-spec.ts` | Real Nest app against PostgreSQL + Redis: auth flows, permissions/scopes, settings, integrations (HTTP recorded with nock), listings, CRM, notifications and realtime, PDPL |
| Admin unit | vitest | `admin/src/**/*.test.ts` | Navigation/permissions, CSV escaping, error-message translation |
| Browser | Playwright scripts | run manually through Caddy | Visual parity with screenshots, end-to-end user journeys |

## Running

```bash
pnpm -r test                                  # everything
pnpm --filter @nx/backend test:unit           # fast
pnpm --filter @nx/backend test:e2e            # needs PostgreSQL + Redis
cd backend && npx jest test/crm.e2e-spec.ts   # one suite
```
Test database/redis: `TEST_DATABASE_URL` (default `postgresql://nx:nx_dev_password@localhost:5432/nx_test`)
and `TEST_REDIS_URL` (default `redis://localhost:6379/15`); migrations are applied by
`test/global-setup.ts`. Tests never touch the development database.

CI (`.github/workflows/ci.yml`) runs: install → schema build + Prisma generate → generated files up to
date (`schema.js`, `docs/technical/reference`) → lint → format → typecheck → migration drift → tests →
`pnpm audit` → image builds.

## Writing an e2e test

```ts
const app = await createTestApp();               // test/helpers.ts — real AppModule + bootstrap
await resetDb(app);                               // test/auth-helpers.ts — add new tables there!
await createStaff(app, 'agent', 'a@x.test', 'Agent-Pass-2026');
const res = await http.post('/api/v1/...').set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${t}`);
```
- Use `freshIp()` per request to avoid rate limits, or clear `rl:*` keys in `beforeEach`.
- Emails: `lastEmail(app, to)` reads the in-memory outbox (OTP codes, links).
- Realtime: `await app.listen(0)` then connect with `socket.io-client` (`path: '/ws'`), see
  `test/crm.e2e-spec.ts`.
- External HTTP: `nock` (network is disabled in suites that need it).
- Assert permissions (403/404 for other roles/scopes), validation (400 with `fields`), audit rows and
  emitted notifications — not only the happy path.

## Acceptance

Each phase's acceptance criteria (docs/11) are covered by e2e tests and recorded in `docs/PROGRESS.md`.
