# Testing

## Layers

| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Schema package | vitest | `packages/schema/test` | Helpers, zod spec builder, generated `schema.js` equals the original contract |
| Backend unit | jest | `backend/src/**/*.spec.ts` | Pure logic: TOTP, encryption, redaction, phone, property rules, booking quote, … |
| Backend e2e | jest + supertest + socket.io-client + nock | `backend/test/*.e2e-spec.ts` | Real Nest app against PostgreSQL + Redis: auth flows, permissions/scopes, settings, integrations (HTTP recorded with nock), listings, CRM, notifications and realtime, PDPL |
| Admin unit | vitest | `admin/src/**/*.test.ts` | Navigation/permissions, CSV escaping, error-message translation |
| Browser | Playwright scripts | run manually (recipe below) | Visual parity with screenshots, end-to-end user journeys at 1440 px and 390 px |

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

## Browser checks (manual, before closing a phase)

Playwright and Chromium are preinstalled in the cloud container (`require('playwright')` works from
any directory). Keep throwaway scripts outside the repository; the recipe:

1. **One origin for site + API** — nginx (no Docker needed), saved as e.g. `/tmp/nx-nginx.conf` and
   started with `nginx -c /tmp/nx-nginx.conf` (stop: `nginx -c … -s stop`):
   ```nginx
   pid /tmp/nx-nginx.pid; error_log /tmp/nx-nginx.err;
   events {}
   http {
     include /etc/nginx/mime.types; access_log off;
     map $http_upgrade $conn { default upgrade; '' close; }
     server {
       listen 8090; root /home/user/aqar/frontend; index index.html; client_max_body_size 12m;
       location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
       location /ws { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1;
                      proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $conn; }
       location ~ ^/property/[0-9]+(-[^/]*)?$ { try_files /property.html =404; }
       location = /account { try_files /account/index.html =404; }
       location / { try_files $uri $uri.html =404; }
     }
   }
   ```
   Start the API with `PUBLIC_URL=http://127.0.0.1:8090` (WebSocket origin check and payment return
   URLs) plus the worker; the admin on Vite (`cd admin && npx vite --port 5173`).
2. **Fresh data**: `npx prisma migrate reset --force --skip-seed`, then the owner seed and
   `node dist/cli/index.js seed-demo`, then `redis-cli flushall`.
3. **Customer login**: in development the OTP email is printed to the API log
   (`[dev email] to=<email>` followed by the 6-digit code) — read it from the log file.
4. **Staff login**: the seeded owner must change the password and enrol TOTP on first login; a script
   can read the secret shown on the 2FA screen and compute the code (RFC 6238, SHA-1, 30 s). For
   scripted runs a `sales_manager` (no mandatory 2FA) is simpler.
5. **Staff actions without the UI** (e.g. approving a transfer while the customer page is open, to
   watch the live update): create a Nest application context from `dist/app.module.js`
   (`NestFactory.createApplicationContext(AppModule)`) and call the service (`TransfersService.approve`).
6. Check each new screen against its `design/screenshots/*.png` at 1440 px and 390 px
   (`document.documentElement.scrollWidth > innerWidth` must be false) and collect `pageerror` events.

## Acceptance

Each phase's acceptance criteria (docs/11) are covered by e2e tests and recorded in `docs/PROGRESS.md`.
