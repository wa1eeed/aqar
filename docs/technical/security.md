# Security

This page lists the controls **implemented** in the code, where they live, and the threats they address.
The baseline requirements are in `docs/10-security-ops.md`.

## 1. Controls

| Area | Control | Where |
|---|---|---|
| Transport | HTTPS only (Caddy auto-TLS), HSTS 1 year | `infra/Caddyfile`, `bootstrap.ts` |
| Headers | helmet; API CSP `default-src 'none'`; site and admin CSPs per area; `frame-ancestors 'none'`; `nosniff`; strict referrer | `bootstrap.ts`, `infra/Caddyfile` |
| Origin | Single origin, no CORS; WebSocket `Origin` must equal `PUBLIC_URL` outside dev/test | `realtime.gateway.ts` |
| Authentication | Default-deny guard; argon2id; lockout after 10 failures; TOTP (RFC 6238) mandatory for owner/admin/finance; hashed recovery codes; replay protection; invite and reset tokens hashed, single use | `common/auth`, `modules/auth` |
| Sessions | Access JWT 15 min (HS256, issuer/audience checked); refresh tokens opaque, hashed, rotated, family revoked on reuse (30 s concurrency grace); revocation by "minimum issued-at"; sockets dropped on revocation and at token expiry | `session.service.ts`, `realtime.gateway.ts` |
| Re-authentication | Password/TOTP within 10 minutes for secrets, staff/roles, refunds, exports | `@RecentAuth` |
| Authorization | Permission keys per route; row-level scopes for "own" roles; out-of-scope → 404 (no existence leak); customers only reach `/me/*` | `permissions.ts`, `access-scope.service.ts` |
| CSRF | Cookies `SameSite=Lax`, path `/api/v1/auth`; cookie-using endpoints require `X-Requested-With: nx` | `csrf.guard.ts`, `cookies.ts` |
| Input | Strict zod DTOs (unknown keys rejected); `plainText` strips control characters and HTML; `sanitize-html` allow-list for rich text; JSON depth/size guard; body limits | `common/security`, `common/http` |
| Enumeration | Same response for unknown email/wrong password; OTP send never reveals accounts | `staff-auth.service.ts`, `customer-auth.service.ts` |
| Rate limiting | Redis sliding window per IP or per body field; fail-closed for auth/OTP; WebSocket connections 60/min/IP | `common/rate-limit`, `realtime.gateway.ts` |
| Brute force on codes | OTP: 6 digits, 10 minutes, 5 attempts, single use; constant-time comparisons | auth and customers services |
| Secrets at rest | Provider credentials AES-256-GCM with AAD, write-only, masked hints; key rotation CLI; national IDs only as peppered hashes | `crypto`, `integrations/integration-store.service.ts` |
| Outbound calls | Gateway with SSRF guard (blocks private/internal addresses), timeouts, circuit breaker, rate limits, redacted call logs | `integrations/gateway.service.ts` |
| Webhooks | Signature verification before storing; idempotent `WebhookEvent` | `modules/webhooks` |
| Uploads | Presigned PUT bound to content type and size; processing re-validates and strips EXIF; private bucket for receipts | `modules/media` |
| CSV exports | Formula-injection neutralisation; re-auth required; audited | `common/http/csv.ts` |
| Realtime | Token-authenticated rooms; minimal payloads; only whitelisted client events, zod-validated; bounded subscriptions | `modules/realtime` |
| Audit | Every state change of listings, leads, viewings, customers, settings, integrations, staff (bookings/payments in Phase 5) | `AuditService` |
| Logging | pino with redaction of secrets, tokens, codes and passwords; correlation ids; emails with codes never logged outside development | `common/logging.ts`, `email.service.ts` |
| Containers | Non-root `node` user, read-only filesystem, no capabilities, `no-new-privileges`; only Caddy publishes ports; Redis password | `infra/docker-compose.yml` |
| Dependencies | Exact versions, `pnpm audit` in CI with documented exceptions, pinned overrides for vulnerable transitive packages | `package.json`, `.github/workflows/ci.yml` |

## 2. Threat → control

| Threat | Mitigation |
|---|---|
| Stolen refresh cookie | httpOnly + Secure + SameSite=Lax + narrow path; rotation and reuse detection revoke the family and alert the user |
| XSS | Strict CSPs (no inline scripts), output escaping in the vanilla site (`ui.esc`), React escaping in the admin, sanitised rich text |
| CSRF | SameSite cookies + mandatory custom header on cookie endpoints; bearer tokens elsewhere |
| IDOR | Scoped queries; customer data always filtered by the token's subject |
| Privilege escalation | Server-side permission checks; system roles read-only; the last owner cannot be removed |
| Brute force / credential stuffing | Rate limits, lockouts, generic errors, mandatory 2FA for privileged roles |
| SSRF via integrations | Gateway blocks private ranges and non-HTTPS targets |
| Malicious uploads | Type/size bound at presign, server-side re-validation, EXIF stripping, private storage |
| Cross-site WebSocket hijacking | Origin check; tokens in handshake auth (not cookies) |
| Payment tampering (Phase 5) | Amounts from the server only; provider re-fetch before marking paid; amount/currency/metadata match; idempotent reconcile |

## 3. Privacy (Saudi PDPL)

- Consent captured with a timestamp at customer registration and on lead forms.
- Data subject rights: `GET /me/export` (JSON), `DELETE /me` (sign-out everywhere, anonymisation after
  30 days by the worker); staff can export on a customer's behalf (re-auth, audited).
- Minimisation: no raw national IDs; receipts private; call logs pruned after 30 days.
- Pending (documented in `docs/QUESTIONS.md`): privacy/terms pages, processing-activities record.
