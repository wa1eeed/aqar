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
4. **Forced password change for the seeded owner** — docs/03 §4 asks for it, but `StaffUser` has no
   flag. Decision: `lastLoginAt = null` means "first login" → password change + 2FA setup are forced
   (Phase 1). Alternative: add a `mustChangePassword Boolean` column. Which do you prefer?
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
