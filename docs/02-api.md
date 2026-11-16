# 02 — API Contract (REST + WebSocket)

Base path `/api/v1`. JSON UTF-8. camelCase. Money in **halalas** in every request/response, plus a
display helper `priceSar` (number, SAR) on public property payloads for the existing frontend.

## 1. Conventions

- **Auth headers**: `Authorization: Bearer <accessToken>`. Refresh token in httpOnly cookie
  `nx_rt` (`Secure; SameSite=Lax; Path=/api/v1/auth`). Staff and customer tokens carry `sub`, `typ`
  (`staff`|`customer`), `role`, `perms` (staff only), `exp`.
- **Errors** (all endpoints):
  ```json
  { "error": { "code": "BOOKING_PROPERTY_UNAVAILABLE", "message": "العقار غير متاح للحجز حالياً", "details": {} , "correlationId": "c_8f…" } }
  ```
  HTTP: 400 validation (`VALIDATION_FAILED`, `details.fields`), 401, 403, 404, 409 conflict, 422
  business rule, 429 rate limit, 502 provider failure (`INTEGRATION_ERROR`), 500.
- **Pagination**: `page` (1-based), `pageSize` (default 12, max 100). Response
  `{ items, total, page, pageSize, pages }`.
- **Idempotency**: `POST /bookings`, `POST /payments/*`, `POST /leads` accept `Idempotency-Key` header
  (stored 24 h in Redis; same key → same response).
- **Rate limits** (Redis sliding window): public GET 120/min/IP, `POST /leads` 10/hour/IP,
  OTP send 5/hour/destination and 20/hour/IP, login 10/15 min/IP.
- **Public read caching**: `Cache-Control: public, max-age=30, stale-while-revalidate=120` on public
  GETs; invalidated through Redis keys on property change.

## 2. Public endpoints (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/config` | Everything the static frontend needs at boot (see §2.1) |
| GET | `/public/schema` | Merged schema (packages/schema + DB cities/districts) |
| GET | `/public/properties` | Filters = existing frontend query (see §3). Only `visibility=published`, not deleted |
| GET | `/public/properties/:id` | 404 if not published. Increments `viewCount` (debounced per IP 30 min) |
| GET | `/public/properties/:id/similar?limit=4` | Same type, then offer, then city; excludes closed statuses |
| GET | `/public/properties/:id/nearby?radius=2000` | Via IntegrationsGateway places provider; cached (docs/05) |
| GET | `/public/properties?ids=1001,1002` | Favorites page (guests) |
| GET | `/public/stats` | `{ total, byType, byCity, byOffer }` non-closed published |
| POST | `/public/leads` | Body §2.2. Creates `Lead` (+ `Viewing` when `type=viewing` and slot given) |
| GET | `/public/agents/:id` | Public agent card (name, title, falLicense, phone, whatsapp, avatar) |
| GET | `/public/pages/:key` | `about`, `privacy`, `terms`, `booking-terms` (HTML from settings.legal) |

### 2.1 `GET /public/config`

```json
{
  "brand": { "name": "منزلة", "fullName": "منزلة العقارية", "tagline": "…", "logoUrl": "…", "logoLightUrl": "…", "faviconUrl": "…" },
  "theme": { "primary": "#0F4C3A", "primaryDark": "#0A2F25", "accent": "#C9A86C", "accentInk": "#85652F", "background": "#FAF7F2", "ink": "#14211C", "radius": 16, "fontDisplay": "Alexandria", "fontBody": "IBM Plex Sans Arabic" },
  "contact": { "phone": "+9665…", "phoneDisplay": "05…", "whatsapp": "9665…", "email": "…", "address": "…", "hours": "…", "officeLat": 24.7, "officeLng": 46.6, "social": { "x": "", "instagram": "", "snapchat": "", "tiktok": "", "linkedin": "" } },
  "licensing": { "regaFalLicense": "1100000000", "regaVerifyUrl": "https://…", "showRegaInFooter": true, "ejarMembership": "…", "showEjarInFooter": true, "cr": "…", "vatNumber": "…" },
  "map": { "provider": "osm", "tilesUrl": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "attribution": "…", "googleBrowserKey": null },
  "nearby": { "radius": 2000 },
  "booking": { "enabled": true },
  "features": { "auctions": false, "customerAccounts": true, "savedSearches": true },
  "currency": "ر.س",
  "realtime": { "url": "/ws" }
}
```
Never include secrets. `googleBrowserKey` is the *referrer-restricted* browser key only.

### 2.2 `POST /public/leads`

```json
{ "type": "viewing", "propertyId": 1001, "name": "…", "phone": "05XXXXXXXX", "email": null,
  "date": "2026-11-20", "slot": "morning", "notes": "", "city": null, "propertyType": null,
  "budget": null, "message": null, "consent": true, "utm": { "source": "x" } }
```
- `phone` normalised to E.164 (`+9665XXXXXXXX`); reject non-Saudi mobile (`^(?:\+?966|0)?5\d{8}$`).
- `type ∈ viewing|waitlist|buy|rent|list|invest|manage|contact`; `propertyId` required for
  `viewing|waitlist`.
- If a customer token is present, link `customerId`.
- Auto-assign: `property.agentId` when present; otherwise round-robin among active `agent` users
  (settings.notifications.leadRouting = `round_robin|manager_only`).
- Response `201 { "id", "number": "L-000123" }`. Emits `lead.created`.

## 3. Property list query (public + admin)

Exactly the parameters used by `frontend/assets/js/api.js` (must keep working unchanged):
`offer, city, district, types (csv), status (csv), hideClosed, priceMin, priceMax (SAR, compared to
annualisedPrice for rent), areaMin, areaMax, bedrooms (min), bathrooms (min), features (csv of bool
spec keys), furnished, landUse, facade, constructionStatus, rentPeriod, roiMin, featured, q, ids,
sort (newest|price_asc|price_desc|area_desc|roi_desc), page, pageSize`.
Closed statuses always sort last. `q` uses full-text + trigram on title/description/district/code.

### Public property payload (shape expected by the frontend)

```json
{
  "id": 1001, "code": "MZ-1001", "slug": "فيلا-مودرن-…", "url": "/property/1001-فيلا-مودرن",
  "type": "villa", "offer": "sale", "status": "available", "featured": true,
  "title": "…", "description": "…",
  "city": "riyadh", "cityLabel": "الرياض", "district": "الملقا", "lat": 24.804, "lng": 46.617,
  "price": 4850000, "priceHalalas": 485000000, "rentPeriod": null, "negotiable": true, "pricePerMeter": 10778,
  "images": ["https://cdn…/1001/a1-card.webp", "…"],
  "media": [{ "kind": "photo", "thumb": "…", "card": "…", "full": "…", "alt": "…" }],
  "createdAt": "2026-11-10", "specs": { "...": "..." },
  "agent": { "id": "…", "name": "…", "role": "…", "phone": "+966…", "whatsapp": "966…", "fal": "…" },
  "booking": { "enabled": true, "paymentTypes": ["deposit", "full"], "depositAmount": 5000000, "methods": ["moyasar", "bank_transfer"] },
  "licensing": { "adLicense": "…", "falLicense": "…", "licenseExpiry": "2027-05-10", "regaVerified": true, "ejarMembership": "…" },
  "summary": "فيلا للبيع في حي الملقا بالرياض، المساحة 450 م²، 5 غرف نوم، السعر 4,850,000 ر.س، الحالة: متاح",
  "faqs": [{ "q": "…", "a": "…" }]
}
```
`price` stays in **SAR** for backward compatibility with the existing UI; every other money field
ending in `Halalas` or inside `booking` is halalas.

## 4. Auth

| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/customer/otp/send` | `{ channel: "email"|"sms", destination }` → 204. SMS only if an SMS integration is enabled |
| POST | `/auth/customer/otp/verify` | `{ destination, code, name? }` → `{ accessToken, customer, isNew }`; creates customer on first login (requires `name` + `consent`) |
| POST | `/auth/customer/password/login` | `{ email, password }` (only if the customer set a password) |
| POST | `/auth/staff/login` | `{ email, password }` → `{ accessToken }` or `{ twoFactorRequired: true, challengeId }` |
| POST | `/auth/staff/2fa` | `{ challengeId, code }` (TOTP) |
| POST | `/auth/refresh` | cookie → new access + rotated refresh |
| POST | `/auth/logout` | revokes refresh family |
| POST | `/auth/staff/password/forgot` & `/reset` | email link via Resend, token 30 min |
| GET  | `/auth/me` | current subject |

## 5. Customer endpoints (`typ=customer`)

| Method | Path | Notes |
|---|---|---|
| GET/PATCH | `/me/profile` | name, email, phone (changing triggers OTP verification), marketingConsent |
| DELETE | `/me` | PDPL deletion request → anonymise after 30 days unless open bookings |
| GET | `/me/export` | PDPL data export (JSON) |
| GET/PUT/DELETE | `/me/favorites`, `/me/favorites/:propertyId` | sync with localStorage on login (frontend merges) |
| GET/POST/PATCH/DELETE | `/me/saved-searches[/:id]` | alerts via `property.matched_saved_search` |
| GET | `/me/viewings` | customer's viewing requests |
| GET | `/me/bookings`, `/me/bookings/:id` | includes payments + transfer submission + timeline |
| POST | `/me/bookings/quote` | `{ propertyId, paymentType }` → `{ amountDue, priceHalalas, paymentTypes, methods, holdMinutes, termsVersion, termsHtml }` — docs/04 §3 |
| POST | `/me/bookings` | create booking — docs/04 §3 |
| POST | `/me/bookings/:id/cancel` | allowed while `pending_payment` or `awaiting_transfer_review` |
| POST | `/me/bookings/:id/pay` | `{ method }` → starts payment, docs/04 |
| POST | `/me/payments/:id/transfer` | multipart: receipt + fields, docs/04 §6 |
| POST | `/me/payments/:id/verify` | called by the result page after a provider redirect → `PaymentsService.reconcile` → `{ status }` |
| GET | `/me/payments/:id/receipt.pdf` | when paid |
| GET | `/me/notifications?unread=1&page=` | customer notification center |
| POST | `/me/notifications/read` | `{ ids: [] }` or `{ all: true }` |
| GET/PUT | `/me/notification-preferences` | per event: inApp, email, sms |

## 6. Staff/admin endpoints (`typ=staff`, permission in brackets)

| Area | Endpoints |
|---|---|
| Dashboard | `GET /admin/dashboard` [dashboard.view] KPIs, charts series, latest leads/bookings, expiring licenses |
| Properties | `GET/POST /admin/properties`, `GET/PATCH/DELETE /admin/properties/:id` [properties.*]; `POST /admin/properties/:id/status` `{ status, reason }` [properties.status]; `POST /admin/properties/:id/publish|unpublish|duplicate`; `POST /admin/properties/:id/rega-check` [properties.edit]; `GET /admin/properties/:id/history` |
| Media | `POST /admin/media/presign` `{ propertyId, kind, contentType, size }` → `{ uploadUrl, key, mediaId }`; `POST /admin/media/:id/complete` → enqueue resize; `PATCH /admin/media/:id` (alt, sort, isCover); `DELETE /admin/media/:id`; `POST /admin/properties/:id/media/reorder` |
| Locations | `GET/POST/PATCH /admin/cities`, `/admin/districts` [settings.locations] |
| Leads | `GET /admin/leads` (filters: stage, type, assignee, source, date, q), `GET/PATCH /admin/leads/:id`, `POST /admin/leads/:id/stage`, `/assign`, `/activities`, `POST /admin/leads` (manual) [leads.*]; `GET /admin/leads/export.csv` |
| Viewings | `GET /admin/viewings?from&to&agentId` (calendar), `POST/PATCH /admin/viewings/:id` [viewings.*] |
| Customers | `GET /admin/customers`, `GET /admin/customers/:id` (profile, bookings, leads, viewings, favorites), `PATCH` (status) [customers.*] |
| Bookings | `GET /admin/bookings`, `GET /admin/bookings/:id`, `POST /admin/bookings/:id/confirm|complete|cancel|extend-hold` [bookings.*] |
| Payments | `GET /admin/payments`, `GET /admin/payments/:id`, `POST /admin/payments/:id/refund` `{ amount, reason }` [payments.refund]; `POST /admin/payments/:id/transfer/approve|reject` [payments.review]; `GET /admin/payments/:id/transfer/receipt` (signed URL, 5 min) |
| Bank accounts | `GET/POST/PATCH/DELETE /admin/bank-accounts` [settings.payments] |
| Notifications | `GET /admin/notifications`, `POST /admin/notifications/read`, `GET/PUT /admin/notification-preferences`; `POST /admin/notifications/broadcast` [notifications.broadcast] (staff-only announcements) |
| Email | `GET /admin/email-logs` [settings.notifications]; `GET/PUT /admin/email-templates/:key` (subject/body overrides, preview, send test) |
| Staff | `GET/POST/PATCH /admin/staff`, `POST /admin/staff/:id/reset-2fa` [staff.manage]; `GET/POST/PATCH /admin/roles` [roles.manage] |
| Settings | `GET /admin/settings`, `GET/PUT /admin/settings/:section` [settings.<section>] — sections in docs/07 §10 |
| Integrations | `GET /admin/integrations`, `GET/PUT /admin/integrations/:key` (config + secrets, write-only), `POST /admin/integrations/:key/test`, `POST /admin/integrations/:key/enable|disable`, `GET /admin/integrations/:key/logs` [integrations.manage] |
| SEO | `GET/PUT /admin/seo/pages/:key`, `GET/POST/PATCH/DELETE /admin/seo/landing-pages`, `GET/PUT /admin/seo/redirects`, `POST /admin/seo/sitemap/rebuild`, `GET /admin/seo/audit` [seo.manage] — docs/07 §11 |
| Audit | `GET /admin/audit?entityType&entityId&actorId` [audit.view] |
| Reports | `GET /admin/reports/leads|bookings|payments|listings?from&to` + `.csv` [reports.view] |

## 7. Webhooks (public, signature-verified, idempotent via `WebhookEvent`)

| Path | Provider |
|---|---|
| `POST /webhooks/moyasar` | Moyasar payment events (docs/04 §5) |
| `POST /webhooks/resend` | Resend email events (Svix signature) |
| `POST /webhooks/rize` | Rize (when enabled) |
| `POST /webhooks/:integrationKey` | Generic for future gov integrations (adapter decides verification) |

Webhook handler: verify → insert `WebhookEvent` (unique provider+externalId; duplicate → 200 no-op) →
enqueue `webhooks` job → return 200 within 2 s.

## 8. SEO routes (served by API, HTML)

| Path | Output |
|---|---|
| `GET /property/:id-:slug` | `frontend/property.html` with injected `<title>`, meta description, canonical, OpenGraph/Twitter tags, `RealEstateListing` + `BreadcrumbList` JSON-LD, and a `<noscript>`/pre-rendered summary block. 301 to canonical slug if slug differs. 410 if deleted, 404 if unpublished |
| `GET /properties/:city[/:type][/:offer]` | Landing pages from `SeoLandingPage` settings (docs/07 §11) rendered into `properties.html` with filters pre-applied |
| `GET /sitemap.xml`, `/sitemap-properties.xml`, `/sitemap-pages.xml` | Generated, cached 1 h, rebuilt on publish |
| `GET /robots.txt` | From settings.seo (includes sitemap URL; AI-crawler rules from GEO settings) |
| `GET /llms.txt` | From settings.seo.geo (docs/07 §11) |
| `GET /feeds/properties.json` | Optional public listing feed (settings.seo.feedEnabled) |
| `GET /theme.css` | Generated theme variables + font imports (docs/07 §10.1), `Cache-Control: public, max-age=31536000, immutable` when requested with `?v=` |

## 9. WebSocket (Socket.IO, path `/ws`)

Handshake `auth: { token }` (optional for public). Server joins rooms:

| Room | Who |
|---|---|
| `public` | everyone |
| `property:{id}` | client emits `subscribe:property` `{ id }` (public) |
| `customer:{id}` | authenticated customer |
| `staff` / `staff:{userId}` / `role:{roleKey}` | authenticated staff |
| `auction:{id}` | auction viewers (docs/09) |

Server → client events (payloads are minimal; clients refetch details when needed):

| Event | Room(s) | Payload |
|---|---|---|
| `property.updated` | `property:{id}`, `public` | `{ id, status, price, visibility }` |
| `property.published` / `property.unpublished` | `public` | `{ id }` |
| `notification.new` | `customer:{id}` or `staff:{id}` | `{ id, eventKey, title, body, link, priority, createdAt }` |
| `notification.count` | same | `{ unread }` |
| `lead.created` / `lead.updated` | `role:*` with leads.view, `staff:{assignee}` | `{ id, number, stage, assignedToId }` |
| `booking.updated` | `customer:{id}`, `staff` | `{ id, number, status }` |
| `payment.updated` | `customer:{id}`, `staff` | `{ id, bookingId, status }` |
| `dashboard.kpis` | `staff` | throttled 10 s |
| `auction.*` | `auction:{id}` | docs/09 |

Client → server: `subscribe:property`, `unsubscribe:property`, `notifications:read` `{ ids }`,
`auction:bid` (docs/09). All emits validated with zod; unknown events ignored.
Use the Redis adapter so multiple API containers broadcast correctly.
