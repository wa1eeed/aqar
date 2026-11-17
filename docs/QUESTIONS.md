# Questions & decisions to confirm

Items where the spec was ambiguous or could not be applied literally. Each has the decision taken so
work could continue; please confirm or correct.

## Phase 0

1. **Prisma preview feature name** — docs/01 lists `fullTextSearchPostgres`, which only exists in
   Prisma 6. With the fixed stack (Prisma 5) the equivalent is `fullTextSearch`. Used that.
2. **Single-line enums** — Prisma rejects `enum X { a b }` on one line. Expanded to one value per
   line; names and values unchanged.
3. **`Property.searchVector`** — the migration notes ask for a `tsvector` column with a GIN index.
   Added it to the schema as `Unsupported("tsvector")?` (plus the GIN/trigram indexes) so Prisma does
   not drop them in later migrations. No existing field was renamed.
4. **Forced password change for the seeded owner** — resolved in Phase 1 by adding
   `StaffUser.mustChangePassword` (see #15), because invited staff also have `lastLoginAt = null`.
5. **Booking terms location** — docs/04 puts them in `settings.booking.termsHtml` (versioned), docs/07
   §10 lists them under `legal`. Decision: single source in `settings.booking`;
   `GET /public/pages/booking-terms` will read from there.
6. **CSP additions** beyond docs/10 §1, required for the current site to keep working:
   Google Fonts (`style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`),
   `style-src 'unsafe-inline'` (the pages use inline `style` attributes), Leaflet from cdnjs,
   and `connect-src https://overpass-api.de` **until Phase 3** moves the nearby query server-side.
   The only inline `<script>` (favorites page) was moved to `assets/js/pages/favorites.js`.
7. **Deployment target** — docs/10 §3 describes a GitHub Actions SSH deploy; the company deploys with
   Coolify. CI builds and pushes images to GHCR; Coolify (or `infra/scripts/deploy.sh`) deploys.
   Should CI also deploy via SSH?
8. **Testcontainers** — docs/10 §8 mentions Testcontainers; e2e tests use the Postgres/Redis service
   containers in CI (as docs/10 §3 describes) and a local test database. Same coverage, simpler CI.
9. **Default payment policies** (no values in the spec): sale/investment deposit fixed 50,000 SAR;
   rent deposit 10 % (min 1,000 SAR); methods: Moyasar + bank transfer for deposits, bank transfer
   (+ Rize for rent) for full payment. Moyasar/Rize stay disabled until their integrations are set up.
10. **`settings.locations`** — cities/districts live in their own tables; the section only holds
    `defaultCityId`. Tell us if other display options are expected.
11. **Leaflet from cdnjs** has no Subresource Integrity hash. Proposal for Phase 3: self-host
    Leaflet under `/assets/vendor/` and drop cdnjs from the CSP.
12. **Staging demo listings** (26 properties + 3 agents) are seeded in Phase 3, together with the
    media pipeline that uploads their photos to R2.
13. **zod 3 advisory GHSA-mrhx-c7xc-m3w5** (memory exhaustion with large failing arrays; fixed only in
    zod 4.6.6). The fixed stack uses nestjs-zod 3 + zod 3, and zod 4 changes how `.default()` works,
    which the settings schemas rely on. Mitigated instead: a global middleware rejects JSON bodies with
    arrays > 1000 items or nesting > 32 levels before validation (`PAYLOAD_TOO_COMPLEX`, 413), the body
    limit is 1 MB, and `boundedArray()` checks length before elements. The advisory is ignored in
    `pnpm audit` with this justification. Proposal: migrate to zod 4 + nestjs-zod 5 in Phase 1. Agree?
14. **Dependency pins** — patched versions of transitive packages are pinned with `pnpm.overrides`
    (multer, body-parser, lodash, js-yaml, @remix-run/router). Remove each pin once NestJS / React
    Router ship the fixed versions themselves.

## Phase 1

15. **Two `StaffUser` fields added** (the data model had nowhere to store them): `mustChangePassword`
    (forced first-login change) and `totpRecoveryCodes` (hashed one-time codes, docs/03 §1). No rename.
16. **Two refresh cookies** — docs/02 names one cookie `nx_rt`. A staff member who is also a customer
    in the same browser would overwrite one session with the other, so staff use `nx_srt` and
    customers `nx_rt`; `POST /auth/refresh` and `/auth/logout` take `{ "audience": "staff" | "customer" }`.
17. **Endpoints added to complete the documented flows**: `staff/password/initial`, `staff/2fa/setup`,
    `staff/2fa/enable`, `staff/invite/accept`, `staff/reauth`, `staff/password/change`,
    `staff/me/2fa/setup|enable`, `customer/register` (first login when the profile was not sent with the
    code), `customer/password/set`, `admin/staff/:id/resend-invite`. Read-only `GET /admin/leads[/:id]`
    were added early to prove agent scoping (full CRM in Phase 4).
18. **Emails before Phase 2** — until the Resend integration exists, staging/production record emails
    as `failed` (`EMAIL_PROVIDER_NOT_CONFIGURED`): staff invites, password resets and customer OTP do not
    reach inboxes yet. The seeded owner can log in. Development prints them to the console.
19. **Password policy** (not specified): 12–128 characters, not a common password, at least 5 distinct
    characters, must not contain the email name.
20. **zod 4 upgrade** (#13) is still pending your decision; zod 3 remains with the mitigation in place.

## Phase 2

21. **Provider HTTP details need a live check before go-live.** This development environment could not
    reach resend.com, moyasar.com or Google's documentation, so the adapters follow the documented
    APIs as known at implementation time and are tested against recorded responses. Before enabling
    each one in production: run «اختبار الاتصال» with sandbox keys, send one test email, and confirm
    the Resend webhook arrives. Any mismatch is fixed inside the adapter only.
22. **Webhook processing** — docs/02 §7 says "enqueue a webhooks job". Resend events only update
    `EmailLog`, so they are processed inline (well under 2 s) after the signature check and the
    idempotent `WebhookEvent` insert. Payment webhooks (Phase 5) will use the queue.
23. **Google Places categories** — mapping of our 10 nearby categories to Places API (New) types, one
    request per category (max 5 results each), cached 30 days: mosque · school/primary/secondary ·
    hospital/medical_lab/doctor · pharmacy · supermarket/grocery/convenience · shopping_mall ·
    restaurant/cafe · park · gas_station · bank/atm. Adjust if the company prefers other types.
24. **SMS providers** appear as three separate cards (Unifonic, Taqnyat, Msegat) instead of one combined
    card as in the screenshot, because each has its own credentials and only one should be enabled.
25. **Public site falls back to the bundled demo data when the API is unreachable** (`MZ.boot()`), so
    the current frontend-only Coolify deployment keeps working until the full stack is deployed.
    Remove `frontend/data/properties.js` once production runs on the API.
26. **Similar listings order** — the API ranks by same type + city, then price closeness, then newest.
    The old mock broke ties differently, so equally-ranked cards may appear in another order.
27. **Money inside `specs`** (e.g. service charges) is stored in halalas like all money, and returned in
    SAR in the public payload to keep the existing frontend contract unchanged.
28. **Draft vs publish validation** — drafts accept incomplete specs (only types/ranges are checked);
    publishing re-validates strictly and reports every missing item at once.
29. **`POST /public/leads` was built in Phase 3** (instead of 4) so the existing viewing/contact forms
    keep working on the API. A consent checkbox (PDPL) was added to the viewing modal, using the site's
    existing form styles. Lead routing (round-robin to agents) is basic until Phase 4.
30. **Viewing time slots** are stored as UTC hours: morning 10:00, afternoon 16:00, evening 19:00
    (Riyadh). Change if the office uses other hours.
31. **Demo photos** are served from the site's own `/assets/img` instead of R2, so the demo works before
    R2 is configured. Real uploads go to R2 through the media pipeline.
32. **R2 uploads go directly from the browser** with presigned URLs. The R2 bucket needs a CORS rule
    allowing `PUT` from the admin origin (`https://<domain>`) with header `Content-Type`; the admin CSP
    already allows `https://*.r2.cloudflarestorage.com`.
33. **Who gets `lead.created`** — the assignee and users with the `sales_manager` role; when nobody is
    assigned (manager-only routing), everyone who can assign leads. For a viewing request the
    listing's agent receives `viewing.requested` instead, so they get one email, not two.
34. **SMS** — the SMS channel is stored in preferences but nothing is sent until an SMS integration
    exists (docs/05). Quiet hours (SMS only) will apply then. Customer phone changes are saved as
    "not verified" for the same reason.
35. **Email templates** are rendered by a small built-in HTML renderer (RTL, brand colour, legal
    footer, plain-text part) instead of react-email, to avoid a heavy dependency. Subject/intro
    overrides from `settings.notifications.templateOverrides` are applied. The admin page for
    template preview/test email (`/admin/email-templates/:key`) is not built yet — with the settings
    screens? Non-transactional emails link to the notification preferences; a one-click
    `List-Unsubscribe` header needs a signed unsubscribe endpoint (to add with that page).
36. **Customer lead/viewing status labels** on «طلباتي ومعايناتي» are written for customers
    (تم الاستلام، قيد المتابعة، مؤكد…) rather than the internal stage names. Please confirm or send the
    preferred wording.
37. **A customer cancelling a viewing** is logged on the lead and in the audit log, but the catalog has
    no event for it, so the agent is not notified. Add `viewing.cancelled` (agent, in-app + email)?
38. **Viewing conflicts** — only confirmed viewings block an agent's time; several customers may
    request the same slot, and staff choose which to confirm.
39. **Refresh-token rotation grace window** (30 s): two tabs refreshing at the same moment get the same
    new token instead of being treated as token theft (which logged customers out at random). A
    replay after the window still revokes the whole session.
40. **Account pages** are separate pages as in docs/08 §5 (`/account`, `/account/viewings`,
    `/account/notifications`, `/account/saved-searches`, `/account/settings`); the prototype used one
    page with hash routes. «حجوزاتي» appears in Phase 5 with the bookings pages. The session code lives
    in `assets/js/session.js` (loaded after `ui.js`) to keep `ui.js` readable.
41. **Consent text** at sign-up is not linked to a privacy page yet; `privacy.html`/`terms.html` come
    with the legal pages (docs/08 §11).
42. **Admin home dashboard** KPIs (docs/07 §2) are not in the Phase 4 plan; the dashboard stays as
    is until the reports phase unless you want it earlier.
