# 03 — Authentication, Roles & Permissions

## 1. Staff

- Login: email + password (Argon2id, `memoryCost 19456, timeCost 2`). Lockout 15 min after 10 failures.
- 2FA (TOTP, RFC 6238) **mandatory** for roles `owner`, `admin`, `finance`; optional for others.
  Setup screen shows QR + 10 one-time recovery codes (hashed).
- Access JWT 15 min; refresh 14 days rotating; reuse of a revoked refresh token revokes the family
  and notifies the user (`security.session_revoked`).
- Re-authentication (password or TOTP within the last 10 min) required for: integration secrets,
  payment settings, bank accounts, refunds, staff/role changes, data export.

## 2. Customers

- Default: passwordless OTP (6 digits, 10 min, 5 attempts) by **email via Resend**. SMS OTP appears
  automatically when an SMS integration is enabled (docs/05). Optional password can be set in profile.
- First login collects: name, phone (Saudi mobile), consent checkbox (PDPL) with link to privacy page.
- Nafath verification (when `identity.nafath` integration is enabled) is required only for actions the
  admin marks as "requires verified identity": booking full payment above a threshold
  (settings.booking.nafathRequiredAbove), auction registration.
- Customer refresh token 30 days. Customers never access `/admin/*` or staff sockets.

## 3. System roles (seeded, not deletable; permissions editable only for custom roles)

| Permission key | owner | admin | sales_manager | agent | finance | content_editor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard.view | ✓ | ✓ | ✓ | ✓ (own KPIs) | ✓ | ✓ |
| properties.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| properties.create / edit | ✓ | ✓ | ✓ | own listings | – | ✓ |
| properties.status | ✓ | ✓ | ✓ | own listings | – | – |
| properties.publish | ✓ | ✓ | ✓ | – | – | ✓ |
| properties.delete | ✓ | ✓ | – | – | – | – |
| leads.view | ✓ | ✓ | ✓ | assigned only | – | – |
| leads.manage (stage, notes) | ✓ | ✓ | ✓ | assigned only | – | – |
| leads.assign | ✓ | ✓ | ✓ | – | – | – |
| viewings.manage | ✓ | ✓ | ✓ | own | – | – |
| customers.view | ✓ | ✓ | ✓ | linked to own leads/bookings | ✓ | – |
| customers.manage (block) | ✓ | ✓ | – | – | – | – |
| bookings.view | ✓ | ✓ | ✓ | own listings | ✓ | – |
| bookings.manage (confirm/complete/cancel) | ✓ | ✓ | ✓ | – | ✓ | – |
| payments.view | ✓ | ✓ | – | – | ✓ | – |
| payments.review (bank transfers) | ✓ | ✓ | – | – | ✓ | – |
| payments.refund | ✓ | – | – | – | ✓ | – |
| notifications.broadcast | ✓ | ✓ | ✓ | – | – | – |
| reports.view | ✓ | ✓ | ✓ | – | ✓ | – |
| seo.manage | ✓ | ✓ | – | – | – | ✓ |
| settings.general / branding / contact / legal | ✓ | ✓ | – | – | – | ✓ (branding, legal) |
| settings.licensing | ✓ | ✓ | – | – | – | – |
| settings.booking / payments | ✓ | ✓ | – | – | ✓ | – |
| settings.notifications / maps / features / locations | ✓ | ✓ | – | – | – | – |
| integrations.manage | ✓ | ✓ | – | – | – | – |
| staff.manage / roles.manage | ✓ | ✓ (cannot edit owner) | – | – | – | – |
| audit.view | ✓ | ✓ | – | – | – | – |
| auctions.manage | ✓ | ✓ | ✓ | – | – | – |

"own"/"assigned only" are enforced with row-level checks in services (not only guards).

Implementation: `@RequirePermissions('leads.manage')` decorator + `PermissionsGuard`; scoped queries
through `AccessScopeService.forStaff(user)` returning Prisma `where` fragments.

## 4. Seed accounts

Seed creates one `owner` from env `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` (forced password change and
2FA setup on first login) — never hard-code credentials.

---

## تحديث — الدخول الموحّد للمكاتب (مرحلة الإطلاق)

راجع `docs/15 §2`. دخول موظفي المكاتب من رابط موحّد `/login` (لا نطاق كل مكتب): يُحلّ المستأجر من بريد
الموظف عند غياب سياق المستأجر، ويُضبط من `tid` في التوكن داخل `JwtAuthGuard` (العزل محفوظ). السوبر-أدمن
من `/super`. حالة الجلسة للواجهة: `GET /auth/session`. النطاقات الفرعية لموقع المكتب العام فقط.
