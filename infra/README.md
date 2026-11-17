# Infrastructure

| File | Purpose |
|---|---|
| `docker-compose.yml` | Production stack: caddy, api, worker, postgres 16, redis 7, `migrate` (one-off), `frontend` / `admin` (static files) |
| `docker-compose.dev.yml` | Local override: http://localhost:8080 |
| `Caddyfile` | Routing, security headers, CSP, clean URLs, 404 page |
| `docker/Dockerfile` | Multi-target build: `api`, `frontend-static`, `admin-static` |
| `.env.example` | Every variable, with the command to generate each secret |
| `scripts/backup.sh` · `restore.sh` · `deploy.sh` | Encrypted backups, restore (and restore test), plain-VPS deploy |

## Local

```bash
cp infra/.env.example infra/.env.dev   # fill the secrets; PUBLIC_URL=http://localhost:8080, SITE_ADDRESS=:80
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --env-file infra/.env.dev up --build
```
`/` public site · `/admin` admin panel · `/api/v1/health` API health.

Without Docker: run PostgreSQL 16 + Redis 7, copy `backend/.env.example` to `backend/.env`, then
`pnpm install`, `pnpm --filter @nx/backend migrate:deploy`, `pnpm --filter @nx/backend seed`,
`pnpm --filter @nx/backend dev`, `pnpm --filter @nx/admin dev`.

## Coolify (Docker Compose)

1. New resource → the repository → Build Pack **Docker Compose** → compose file `infra/docker-compose.yml`.
2. Environment variables: everything from `.env.example`, with:
   - `SITE_ADDRESS=:80` (Coolify's proxy terminates TLS)
   - `TRUST_PROXY_HOPS=2` (Coolify proxy + Caddy, so rate limits see the real client IP)
   - `HTTP_PORT=127.0.0.1:8081` and `HTTPS_PORT=127.0.0.1:8443` (do not take the host's 80/443 from Coolify)
3. Assign the domain to the **caddy** service, port **80**.
4. Deploy. `migrate` applies migrations and the seed before `api` and `worker` start.

## Plain VPS

Set `SITE_ADDRESS=<your-domain>` (Caddy issues certificates), point DNS to the server, then
`infra/scripts/deploy.sh`. Add the backup cron line from `scripts/backup.sh`.

## Security notes

- Only Caddy publishes ports. Postgres and Redis sit on an internal network; Redis requires a password.
- `api` and `worker` run as the unprivileged `node` user with a read-only filesystem, no Linux
  capabilities and `no-new-privileges`.
- Secrets live only in the environment (`.env` is git-ignored); provider credentials are stored
  encrypted in the database (AES-256-GCM) and edited from the admin panel (Phase 2).
- Backups are encrypted with `age` before they touch the disk; keep the private key off the server.

## Cloudflare R2 (media uploads)

The admin uploads photos straight to R2 with presigned URLs, so the bucket needs one CORS rule
(R2 → bucket → Settings → CORS policy):

```json
[{ "AllowedOrigins": ["https://YOUR-DOMAIN"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

Then enter the account id, keys, bucket and public CDN URL in «التكاملات ← Cloudflare R2» and run
«اختبار الاتصال». Set `CDN_ORIGIN` in `.env` to the same public URL so the site's CSP allows the images.

To load the demo listings on a staging server: `docker compose exec api node dist/cli/index.js seed-demo`
(refuses to run when `NODE_ENV=production`).
