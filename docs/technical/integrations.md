# Integrations

All third-party services are configured from the admin panel (**التكاملات**) — no redeploy needed.
Credentials are stored encrypted (AES-256-GCM), never returned after saving (masked hints only), and
editing them requires a recent re-authentication. Every call goes through `IntegrationsGateway`
(timeouts, retries for idempotent calls, rate limits, circuit breaker, SSRF guard, redacted call logs).

Each integration has: **environment** (تجريبي / مباشر — switching to live needs explicit
confirmation), **اختبار الاتصال**, **health** (checked every 15 min), and **السجل** (call logs, 30 days).

| Key | Status | Purpose | Configure | Webhook |
|---|---|---|---|---|
| `maps.osm` | live (default) | Map tiles on the site | Nothing required | — |
| `maps.google` | live | Google Maps instead of OSM | Browser key (referrer-restricted) + server key | — |
| `places.overpass` | live (default) | Nearby places (mosques, schools…) | Endpoint (default public Overpass) | — |
| `places.google` | live | Nearby via Google Places (New) | Server API key | — |
| `email.resend` | live | All emails (OTP, notifications) | API key, sender name/email, reply-to, verified domain | `POST /api/v1/webhooks/resend` (Svix signing secret) |
| `storage.r2` | live | Listing media (public bucket) and private uploads | Account id, access key, secret, buckets, public CDN URL; bucket CORS rule ([operations](./operations.md#2-first-run-checklist)) | — |
| `payments.moyasar` | settings + connection test; payment flows in Phase 5 | Card, mada, Apple Pay, STC Pay | Secret key, publishable key (embedded form), webhook secret, mode (invoice / embedded form) | `POST /api/v1/webhooks/moyasar` (Phase 5) |
| `payments.rize` | prepared (disabled) | Rent instalments | Awaiting the partner API documentation | `/api/v1/webhooks/rize` |
| `gov.rega`, `gov.ejar`, `identity.nafath`, `gov.nafith` | prepared (disabled) | Licence checks, lease contracts, identity, promissory notes | Awaiting credentials and documentation | `/api/v1/webhooks/<key>` |
| `sms.unifonic`, `sms.taqnyat`, `sms.msegat` | prepared (disabled) | SMS OTP and alerts (one provider at a time) | Awaiting the company's choice | — |

"Prepared" integrations show their settings form but cannot be enabled until their adapter is
implemented; the platform hides the related features meanwhile.

## Notes per provider

- **Resend**: until it is configured, staging/production record emails as failed (codes are never
  logged); development prints them to the API log. Hard bounces notify admins (`email.bounced`).
- **R2**: presigned PUT URLs are bound to content type and size; uploads land in the browser → R2
  directly, then the worker processes them. The admin CSP allows `https://*.r2.cloudflarestorage.com`.
- **Overpass/Google Places**: results cached per property for 30 days (database + Redis).
- **Moyasar**: test with `sk_test_…` keys in the sandbox environment; switching to live requires
  `sk_live_…`. The site loads Moyasar's form only in embedded mode (CSP allows `cdn.moyasar.com` and
  `api.moyasar.com`). Server-side, a payment is marked paid only after re-fetching it from Moyasar and
  matching amount, currency and metadata (Phase 5).
- The build environment could not reach some provider documentation sites; adapters follow the
  documented APIs and are tested against recorded responses — run «اختبار الاتصال» and one real
  sandbox transaction before go-live (`docs/QUESTIONS.md` #21).

## Adding a provider
See [backend.md → Add an integration provider](./backend.md#add-an-integration-provider).
