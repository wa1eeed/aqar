# 10 — Security, Privacy, Deployment & Operations

## 1. Security baseline

- HTTPS only (Caddy auto-TLS), HSTS 1 year, `helmet` headers. CSP (public): `default-src 'self'`;
  `img-src 'self' https://cdn.<domain> https://*.tile.openstreetmap.org https://maps.gstatic.com data: blob:`;
  `script-src 'self' https://cdnjs.cloudflare.com https://maps.googleapis.com https://cdn.moyasar.com` (+ analytics hosts when consented);
  `connect-src 'self' wss://<domain> https://api.moyasar.com`; `frame-src https://*.moyasar.com`.
- CORS: same-origin only (frontend, admin and API share the domain).
- CSRF: refresh cookie is `SameSite=Lax` + endpoint requires custom header `X-Requested-With: nx`.
- Validation on every input (zod); HTML fields sanitised with `sanitize-html` allow-list.
- Uploads: content-type + magic-bytes check, size limits, random keys, private bucket for receipts and
  documents; public media only after processing.
- IDOR: every customer query scoped by `customerId`; staff queries through `AccessScopeService`.
- Secrets: env for infrastructure (`DATABASE_URL`, `REDIS_URL`, `APP_ENCRYPTION_KEY`, `JWT_*`,
  `R2_*` defaults, `RESEND_API_KEY` default); provider credentials in `Integration.secretsEnc`.
  Key rotation command: `pnpm cli rotate-encryption-key --new <key>` re-encrypts all rows.
- Dependency audit in CI (`pnpm audit --prod`), Renovate weekly.

## 2. Saudi PDPL (نظام حماية البيانات الشخصية)

- Explicit consent at sign-up and lead forms (timestamp stored); privacy policy page.
- Data minimisation: no raw national IDs; receipts private; IBANs of customers are not stored.
- Data subject rights: export (`/me/export`), deletion (`DELETE /me` → anonymise after 30 days unless
  legal retention for financial records applies — keep payments/bookings with pseudonymised customer).
- Retention: leads closed > 24 months anonymised; call logs 30 days; notifications 180 days.
- Hosting: prefer a VPS region inside KSA when possible; R2 jurisdiction setting documented by the
  company. Record processing activities in `docs/PDPL.md` (create a template).

## 3. Deployment (Docker Compose)

Services: `caddy`, `api`, `worker`, `postgres:16`, `redis:7`, `frontend` (static files volume),
`admin` (static files volume). Volumes: `pgdata`, `redisdata`, `caddy_data`, `generated` (theme.css,
sitemaps, favicons). Healthchecks for every service. `infra/.env.example` lists every variable with
comments.

```
caddy:  :443 → /api/* & /ws* & /property/* & /properties/* & /sitemap*.xml & /robots.txt & /llms.txt & /feeds/* & /theme.css → api:3000
               /admin/* → admin static (SPA fallback to /admin/index.html)
               /* → frontend static (try_files {path} {path}.html /404.html)
```
CI (GitHub Actions): lint → test (with Postgres/Redis services) → build images → push to GHCR →
SSH deploy (`docker compose pull && docker compose up -d`) → run `prisma migrate deploy` in a one-off
container → smoke test `/api/v1/health`.

## 4. Backups & recovery

Nightly `pg_dump -Fc` encrypted (age) → R2 private bucket `backups/` (30 daily, 12 monthly). Weekly
automated restore test into a temp container. R2 media is the source of truth for files (versioning
on). Document RPO 24 h / RTO 4 h.

## 5. Observability

- `/api/v1/health` (db, redis, queue lag) and `/api/v1/ready`.
- Pino JSON logs with `correlationId` (also returned in error bodies and set on outgoing integration
  calls); log rotation via Docker.
- Optional Sentry DSN (env) for API, worker, admin and frontend errors.
- Uptime monitor on `/api/v1/health` and the home page.
- Admin «حالة النظام» card: queue sizes, failed jobs (retry button), integration health, disk usage.

## 6. Jobs (BullMQ, worker container)

| Queue / job | Schedule |
|---|---|
| `bookings.expire` | every 1 min |
| `payments.reconcile` | every 5 min |
| `viewings.remind` | every 10 min |
| `licenses.check` (expiry + REGA validation when enabled) | daily 03:00 Asia/Riyadh |
| `searches.digest` | daily 09:00 |
| `integrations.health` | every 15 min |
| `media.process` | on demand |
| `email.send`, `sms.send`, `webhooks.process` | on demand |
| `seo.sitemap`, `seo.og-images` | on publish + nightly |
| `maintenance.prune` | daily 04:00 |
| `backup.db` | daily 02:00 (host cron calls `infra/scripts/backup.sh`) |

## 7. Performance targets

Public API p95 < 200 ms (cached) / < 500 ms (uncached); property page LCP < 2.5 s on 4G; images served
as WebP with `srcset` (thumb 480, card 960, full 1920); Lighthouse ≥ 90 performance, ≥ 95 SEO and
accessibility on home, listing and property pages (Lighthouse CI in pipeline).

## 8. Testing

- Unit: services (quote, state machines, permissions, redaction, encryption, schema builder).
- e2e (Jest + supertest, Testcontainers Postgres/Redis): every endpoint in docs/02 happy + main error.
- Contract tests for provider adapters with recorded fixtures (nock); sandbox tests behind `E2E_SANDBOX=1`.
- Playwright: visitor browse/filter, lead submit, OTP login (email captured via a Resend test
  double), booking with Moyasar sandbox, bank transfer upload + admin approval, admin property create
  & publish, theme change reflected on site.
- Seed data: port the 26 demo properties from `frontend/data/properties.js` (images uploaded to R2
  staging from `frontend/assets/img/photos`) — staging only, never production.

## 9. Out of scope (documented for later)

ZATCA e-invoicing (Fatoora) for receipts/tax invoices, English site version (advanced package),
mobile apps, owner portal, CRM integrations.
