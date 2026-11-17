# Operations

Deployment, first run, background jobs, backups, monitoring and runbooks. Environment variables:
[reference/environment.md](./reference/environment.md) (generated).

## 1. Deployment options

### Coolify (recommended for the company server)
1. New resource → this repository → Build Pack **Docker Compose** → file `infra/docker-compose.yml`.
2. Environment: every variable of `infra/.env.example` (generate secrets with the commands written
   there), plus `SITE_ADDRESS=:80`, `TRUST_PROXY_HOPS=2`, `HTTP_PORT=127.0.0.1:8081`,
   `HTTPS_PORT=127.0.0.1:8443`, `PUBLIC_URL=https://<domain>`, `CDN_ORIGIN=<R2 public URL>`.
3. Assign the domain to the **caddy** service on port 80 (Coolify's proxy terminates TLS).
4. Deploy. The one-off `migrate` service applies migrations and seeds the owner before `api`/`worker`.

> Current state: Coolify deploys **only the static site** (Base Directory `/frontend`, nginx). The
> backend goes live when the resource is switched to Docker Compose as above.

### Plain VPS
`SITE_ADDRESS=<domain>` (Caddy obtains certificates), DNS to the server, then `infra/scripts/deploy.sh`.

### Images
`infra/docker/Dockerfile` targets: `api` (API + worker + CLI, non-root, read-only FS), `frontend-static`,
`admin-static`. CI builds them on every push and pushes to GHCR from `main`.

## 2. First run checklist

1. Log in to `/admin` with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` → forced password change →
   mandatory 2FA setup (save the recovery codes offline).
2. **التكاملات**: configure and test Resend (email domain verified, SPF/DKIM), Cloudflare R2 (bucket
   CORS rule below), maps/places (OSM works without keys), Moyasar (sandbox first) — see
   [integrations.md](./integrations.md).
3. **الإعدادات**: branding, contact, licensing (REGA FAL, Ejar, CR, VAT), locations (cities/districts),
   notifications (lead routing), booking/payments (Phase 5).
4. **الفريق والصلاحيات**: invite staff; owner/admin/finance must enable 2FA.
5. Add listings (or on staging only: `docker compose exec api node dist/cli/index.js seed-demo`).
6. Set up the backup cron (§4) and an uptime monitor on `/api/v1/health`.

R2 bucket CORS (browser uploads from the admin):
```json
[{ "AllowedOrigins": ["https://YOUR-DOMAIN"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

## 3. Jobs and queues

All jobs run in the `worker` container (BullMQ on Redis). Schedulers are upserted at worker start,
so redeploying never duplicates them. Jobs are idempotent.

| Queue | Job | Schedule | What it does |
|---|---|---|---|
| `email` | `send` | on demand | Delivers an email through Resend; 5 attempts, exponential backoff from 1 min; permanent 4xx not retried; status in `EmailLog` |
| `media` | process | on demand | Image variants (480/960/1920, JPEG + WebP), EXIF removed; failures mark the media item failed |
| `integrations` | `health` | every 15 min | Connection test of enabled integrations; health changes notify admins (email when down) |
| `integrations` | `prune` | daily | Deletes integration call logs older than 30 days |
| `crm` | `viewing-reminders` | every 15 min | Reminders 24 h (in-app + email) and 2 h (in-app) before confirmed viewings, once each |
| `crm` | `saved-search-digest` | 06:00 UTC (09:00 Riyadh) | New published listings matching each saved search with alerts on |
| `crm` | `anonymise-deleted` | 00:30 UTC | Anonymises customer accounts 30 days after a deletion request (PDPL) |

Inspect queues with `redis-cli` (`KEYS bull:<queue>:*`) or BullMQ tooling; failed jobs are logged with
queue, job id and attempt.

## 4. Backups and restore

- Nightly: `infra/scripts/backup.sh` (host cron `0 2 * * *`): `pg_dump -Fc` streamed through `age`
  (public key on the server, private key kept offline) → `/var/backups/nx`, optional off-site copy to a
  private R2 bucket.
- Restore test (weekly recommended): `infra/scripts/restore.sh <file> <age-key> --into-temp` restores
  into `nx_restore_test` and prints row counts without touching production.
- Full restore: `infra/scripts/restore.sh <file> <age-key>` (stops api/worker, replaces the database).
- Files: R2 is the source of truth for media and receipts (enable bucket versioning).
- Targets: RPO 24 h, RTO 4 h.

## 5. Monitoring and logs

- `GET /api/v1/health` (database, Redis, queue lag) and `GET /api/v1/ready` — use for uptime checks.
- Logs: JSON (pino) on stdout, Docker log rotation (10 MB × 5). Every request has a `correlationId`
  (in the response error body and in outgoing integration call logs) — search logs by it.
- Integration call logs and health: admin → التكاملات → integration → السجل.
- Email delivery status: `EmailLog` table (`queued/sent/delivered/bounced/failed`).
- Optional Sentry: `SENTRY_DSN`.

## 6. Security operations

- **Rotate the encryption key** (integration secrets, TOTP secrets):
  `APP_ENCRYPTION_KEY=<current> node dist/cli/index.js rotate-encryption-key --new <new>`, then deploy
  with `APP_ENCRYPTION_KEY=<new>` and `APP_ENCRYPTION_KEY_PREVIOUS=<old>`, then remove the previous key.
- **Rotate JWT secrets**: change `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` and redeploy (everyone signs in again).
- **Staff account compromise**: admin → الفريق → deactivate or reset 2FA (ends all sessions).
- **Customer account abuse**: admin → العملاء → حظر (ends all sessions).

## 7. Runbooks

| Symptom | Check | Action |
|---|---|---|
| Emails not arriving | `EmailLog` status; التكاملات → Resend → السجل | Verify domain/API key; failed jobs retry automatically; bounced addresses notify admins |
| Photos stuck «قيد المعالجة» | worker logs (`media` queue); R2 health | Restart worker; check R2 credentials/CORS; failed items can be deleted and re-uploaded |
| Users logged out unexpectedly | API logs for `refresh_reuse`; clock skew | Reuse after the 30 s grace means a stolen or replayed cookie — the family was revoked on purpose |
| Live updates not arriving | Browser console WebSocket errors; `/ws` through Caddy; `PUBLIC_URL` origin | `PUBLIC_URL` must match the site origin exactly; Redis must be reachable by API and worker |
| `429 RATE_LIMITED` for many users | `TRUST_PROXY_HOPS` | Wrong value makes every user share the proxy's IP — set it to the number of proxies |
| Integration marked «متوقف» | التكاملات → السجل; circuit breaker opens after 5 failures | Fix credentials/provider; the next health check (≤ 15 min) or «اختبار الاتصال» closes it |
| API refuses to start | Container logs list invalid variables (never values) | Fix `.env` according to [reference/environment.md](./reference/environment.md) |
