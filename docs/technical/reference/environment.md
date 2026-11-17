# Environment variables (API and worker)

> **Generated** by `pnpm docs` from the source code — do not edit by hand.
> Regenerate after any change; CI runs `pnpm docs:check`.

Validated at boot by `backend/src/config/env.ts`: the process refuses to start with a missing or weak
value and never prints values. Production template: `infra/.env.example`; local: `backend/.env.example`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` · `test` · `staging` · `production`. Staging/production never print emails or codes. |
| `PORT` | no | `3000` | HTTP port of the API process. |
| `LOG_LEVEL` | no | `info` | pino log level. Logs are JSON; secrets are redacted. |
| `PUBLIC_URL` | no | `http://localhost:8080` | Public origin of the site (https in production). Used in emails, callbacks and the WebSocket origin check. |
| `TRUST_PROXY_HOPS` | no | `1` | Number of reverse proxies in front of the API (Caddy = 1; Coolify proxy + Caddy = 2). Rate limits and audit IPs depend on it. |
| `DATABASE_URL` | yes |  | PostgreSQL 16 connection string. |
| `REDIS_URL` | yes |  | Redis 7 (cache, rate limits, sessions revocation, BullMQ, Socket.IO adapter). |
| `APP_ENCRYPTION_KEY` | yes |  | AES-256-GCM key (base64 of 32 bytes) for integration secrets and TOTP secrets. `openssl rand -base64 32`. |
| `APP_ENCRYPTION_KEY_PREVIOUS` | no |  | Previous key, only while running `rotate-encryption-key`. |
| `JWT_ACCESS_SECRET` | yes |  | HS256 secret for 15-minute access tokens (≥ 32 chars, different from the refresh secret). |
| `JWT_REFRESH_SECRET` | yes |  | Secret for refresh-token hashing (≥ 32 chars). |
| `NATIONAL_ID_PEPPER` | yes |  | Pepper for national ID hashes (≥ 32 chars). |
| `RESEND_API_KEY` | no |  | Optional bootstrap value for the Resend integration; the value saved in the admin panel wins. |
| `R2_ACCOUNT_ID` | no |  | Optional bootstrap value for Cloudflare R2 (admin panel wins). |
| `R2_ACCESS_KEY_ID` | no |  | Optional bootstrap value for Cloudflare R2. |
| `R2_SECRET_ACCESS_KEY` | no |  | Optional bootstrap value for Cloudflare R2. |
| `R2_UPLOADS_BUCKET` | no |  | Private bucket (transfer receipts, original uploads). |
| `R2_MEDIA_BUCKET` | no |  | Public media bucket (listing photo variants). |
| `R2_PUBLIC_BASE_URL` | no |  | CDN base URL of the media bucket. |
| `SWAGGER_ENABLED` | no | `false` | `true` serves Swagger UI at `/api/docs` (never in production). |
| `SENTRY_DSN` | no |  | Optional error tracking DSN. |
| `CHROMIUM_PATH` | no |  | Chromium binary for receipt PDFs (worker). Set in the Docker image (`/usr/bin/chromium`); without it receipts are emailed without a PDF and downloads answer 503. |
