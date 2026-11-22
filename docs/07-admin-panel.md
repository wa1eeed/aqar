# 07 — Admin Panel (`admin/`)

React SPA served at `/admin`, RTL, Arabic, same design tokens as the public site (load `/theme.css`,
docs/08 §1, so admin follows the brand colours). Layout: right-side sidebar (collapsible, icons +
labels), top bar (global search `Ctrl/⌘+K` across properties/leads/customers/bookings, notification
bell, user menu). Works from 1024 px; key screens (leads, viewings, transfer review, property status)
must also work on a 390 px phone.

## 1. Navigation (sidebar, in this order)

| Icon | Label | Route | Permission |
|---|---|---|---|
| grid | الرئيسية | `/admin` | dashboard.view |
| building | العقارات | `/admin/properties` | properties.view |
| inbox | الطلبات | `/admin/leads` | leads.view |
| calendar | المعاينات | `/admin/viewings` | viewings.manage |
| key | الحجوزات | `/admin/bookings` | bookings.view |
| card | المدفوعات | `/admin/payments` (+ tab «تحويلات بانتظار المراجعة» with count) | payments.view |
| users | العملاء | `/admin/customers` | customers.view |
| gavel | المزادات | `/admin/auctions` (flag) | auctions.manage |
| chart | التقارير | `/admin/reports` | reports.view |
| search | تحسين الظهور (SEO) | `/admin/seo` | seo.manage |
| bell | الإشعارات | `/admin/notifications` | — |
| plug | التكاملات | `/admin/integrations` | integrations.manage |
| gear | الإعدادات | `/admin/settings/*` | settings.* |
| shield | الفريق والصلاحيات | `/admin/staff` | staff.manage |
| list | سجل العمليات | `/admin/audit` | audit.view |

## 2. Dashboard

KPI cards (live via `dashboard.kpis`): عقارات منشورة · طلبات جديدة اليوم · معاينات هذا الأسبوع ·
حجوزات مؤكدة هذا الشهر · مدفوعات هذا الشهر (ر.س) · تحويلات بانتظار المراجعة.
Charts: leads per day (30 d, line), leads by source (bar), listings by status (bar), bookings funnel.
Tables: latest 8 leads (stage pill, assignee, time ago), licenses expiring ≤ 30 days, integration
health strip. Agents see only their own numbers.

## 3. Properties

- **List**: table (cover thumb, code, title, type, offer badge, status pill, price, city/district,
  agent, visibility, updated) + filters identical to the public filters + visibility + agent + license
  state. Bulk: publish, unpublish, feature/unfeature, change agent, export CSV. Row action «تغيير الحالة»
  opens a modal (status select limited by `statusesFor(offer)`, reason).
- **Editor** (`/admin/properties/new`, `/:id`), tabs, sticky save bar, autosave draft every 20 s:
  1. **الأساسيات** — type (cards with icons), offer (filtered by `types[type].offers`), title,
     description (rich text limited to paragraphs/lists), featured, agent.
  2. **الموقع** — city, district (with «إضافة حي» inline), map picker (drag pin, search address via
     places.geocode when available), «إظهار الموقع الدقيق» toggle.
  3. **المواصفات** — generated from `fieldsFor(type, offer)` grouped by `fieldGroups`; number inputs
     with units, selects, toggles; required markers.
  4. **السعر والحجز** — price (SAR input, stored halalas), rentPeriod, negotiable, payments/deposit
     preview, «تفعيل الحجز لهذا العقار», optional policy override (same form as settings.booking policy).
  5. **الصور والملفات** — drag-and-drop multi upload (presigned R2), progress, processing state,
     reorder by drag, set cover, alt text, floor plans, video URL, max 40 photos, 15 MB each.
  6. **الترخيص** — رقم ترخيص الإعلان، رقم رخصة فال، تاريخ الانتهاء; «التحقق من الهيئة» button
     (gov.rega when enabled) with result pill; publish is blocked when license is empty or expired.
  7. **SEO** — focus keyword, SEO title, meta description, slug, OG image choice, noindex toggle,
     live Google snippet preview + score panel (docs §11.5).
  8. **السجل** — status history + audit entries.
  Header actions: «معاينة» (opens public page in preview mode with draft banner), «نشر/إلغاء النشر»,
  «نسخ العقار», «حذف».

## 4. Leads

Kanban (stages new → contacted → viewing → negotiation → won / lost) with drag-and-drop (lost asks for
reason) + table view with filters. Lead drawer: contact block with «اتصال» (tel:), «واتساب»
(wa.me with prefilled text), «بريد»; property card; timeline (activities, stage changes, emails sent);
add note; schedule viewing; assign; link/create customer. Manual lead creation form. CSV export.

## 5. Viewings

Calendar (week/day/list) per agent with colour per status; create/edit modal; confirm triggers
`viewing.confirmed` to customer; quick «تمت / لم يحضر / إلغاء».

## 6. Bookings & payments

- Bookings list (number, property, customer, type عربون/كامل, method, amount due/paid, status, hold
  countdown). Detail: timeline, payments, transfer submission, actions «تأكيد», «إتمام», «إلغاء»
  (reason, optional refund), «تمديد المهلة».
- Payments list + detail (provider ids, events log). Refund modal (amount ≤ refundable, reason,
  re-auth).
- **Transfer review queue**: card per submission with receipt viewer (PDF/image zoom), expected vs
  submitted amount, bank account, reference; «اعتماد» / «رفض» (reason required).

## 7. Customers

List (name, phone, email, verified badges, bookings count, last activity) and profile (contact,
leads, viewings, bookings, payments, favorites, saved searches, notes, block/unblock, PDPL export).

## 8. Notifications

Admin notification center (docs/06 §2) + «إرسال تنبيه للفريق» broadcast form (roles, title, body).

## 9. Integrations

Grid + generated detail pages as defined in docs/05 §5. Categories in Arabic: الخرائط · الأماكن
القريبة · المدفوعات · البريد الإلكتروني · التخزين · الجهات الحكومية · الهوية الرقمية · الرسائل النصية.

## 10. Settings (each section = one page, zod schema in `backend/src/modules/settings/schemas/*.ts`)

| Section key | Page title | Fields |
|---|---|---|
| `general` | الإعدادات العامة | listingCodePrefix (default `MZ`, matches existing listing codes), timezone `Asia/Riyadh`, defaultPageSize, maintenanceMode + message, publicUrl |
| `branding` | الهوية والمظهر | **see §10.1** |
| `contact` | بيانات التواصل | phone, phoneDisplay, whatsapp, email, address, hours, office lat/lng (map picker), social links (x, instagram, snapchat, tiktok, linkedin, youtube) |
| `licensing` | التراخيص والاعتمادات | **see §10.2** |
| `booking` | الحجز | docs/04 §2 `settings.booking` (policy editor per offer with live quote example) |
| `payments` | طرق الدفع | docs/04 §2 `settings.payments` (each method card shows whether its integration is ready) |
| `bank_transfer` | التحويل البنكي | bank accounts CRUD (bank select with Saudi banks list + logo, beneficiary, IBAN with validation and formatting, account no., SWIFT, active, order) + `settings.bank_transfer` (instructions rich text, next-steps list editor, reference hint, receipt rules) + live preview of the customer screen |
| `notifications` | الإشعارات | lead routing, quiet hours, default channels per event (docs/06 table), sender name, email template overrides list |
| `maps` | الخرائط | provider (osm/google), default center/zoom, nearby radius, nearby categories enabled, cache days |
| `locations` | المدن والأحياء | cities (activate, order), districts CRUD with coordinates |
| `features` | المزايا | auctions, customerAccounts, savedSearches, booking, compare (future) toggles |
| `legal` | الصفحات القانونية | about (rich text), privacy policy, terms, booking terms (versioned), cookie notice |

### 10.1 الهوية والمظهر (branding & theme)

- **Identity**: platform short name (`name`, e.g. «عقار أونلاين»), full name, tagline, logo for light
  backgrounds (SVG/PNG), logo for dark backgrounds, favicon source (square ≥ 512 px → worker generates
  16/32/180/192/512 PNG + `site.webmanifest`), default social share image (1200×630), email logo.
- **Theme colours** (colour pickers with hex input):
  `primary` (default `#0F4C3A`), `primaryDark` (`#0A2F25`), `accent` (`#C9A86C`), `accentInk`
  (`#85652F`), `background` (`#FAF7F2`), `surface` (`#FFFFFF`), `ink` (`#14211C`), `muted`
  (`#5F6B66`). Advanced (collapsed): offer badge colours and status colours.
- **Presets**: «أخضر وذهبي (الافتراضي)», «أزرق ملكي وذهبي», «عنابي وبيج», «رمادي فحمي وتيل»,
  «NX تيل» — selecting a preset fills the pickers.
- **Typography**: display font and body font from a curated Arabic list (Alexandria, IBM Plex Sans
  Arabic, Tajawal, Cairo, Readex Pro, Almarai, Noto Kufi Arabic, Noto Naskh Arabic); option to upload
  self-hosted WOFF2 files.
- **Shape**: corner radius preset (حادّ 6 / ناعم 16 / دائري 24).
- **Live preview** panel: header, hero, search panel, property card, buttons, badges, footer — rendered
  with the unsaved values.
- **Accessibility guard**: WCAG contrast check for ink/background, white/primary, accentInk/surface,
  primary/background; any pair below 4.5:1 shows a red warning and blocks saving until fixed or
  «حفظ رغم التحذير» (owner only).
- **On save**: backend regenerates `/theme.css` (CSS custom properties mapped to the variables used in
  `frontend/assets/css/main.css`, font `@import`, favicon links are in HTML), bumps a version query
  (`/theme.css?v=…`), purges caches, emits `settings.theme_updated`. «استعادة الافتراضي» resets.

### 10.2 التراخيص والاعتمادات (REGA / Ejar)

| Field | Arabic label | Display |
|---|---|---|
| `regaFalLicense` | رقم رخصة فال للمنشأة | Footer badge with REGA logo; property page licensing block |
| `regaFalExpiry` | تاريخ انتهاء رخصة فال | admin reminder 60/30/7 days |
| `regaVerifyUrl` | رابط التحقق من الترخيص | badge links to it (opens new tab) |
| `ejarMembership` | رقم العضوية في منصة إيجار | Footer badge with Ejar logo; property page (rent listings) |
| `crNumber` | رقم السجل التجاري | footer, receipts, emails |
| `vatNumber` | الرقم الضريبي | receipts |
| `nationalAddress` | العنوان الوطني | footer, receipts |
| `showRegaInFooter`, `showEjarInFooter`, `showOnPropertyPage`, `showEjarOnRentOnly` | خيارات العرض | toggles |

Logos are the official assets shipped in `frontend/assets/img/brands/rega.png` and `ejar.png`
(provided with this spec in `spec-assets/`). Do not recolour or distort them; min height 28 px; keep
clear space; alt text «الهيئة العامة للعقار» / «منصة إيجار».

## 11. SEO, AEO & GEO (`/admin/seo`, permission `seo.manage`)

Tabs:

### 11.1 الإعدادات العامة (Global SEO)
siteName, title template (`{page} | {brand}`), default meta description, canonical domain, default
OG image, X handle, language `ar-SA`, index switch (forced `noindex` on staging), verification codes
(Google Search Console, Bing Webmaster, Yandex), analytics (GA4 measurement id, GTM container id,
Meta Pixel, Snap Pixel, TikTok Pixel — loaded only after cookie consent).

### 11.2 قوالب العناوين والأوصاف (templates)
Tokenised templates per page type with live example:
- Property title: `{type} {offer} في حي {district}، {city} — {area} م² | {brand}`
- Property description: `{type} {offer} في {district} بمساحة {area} م²{bedrooms? ، {bedrooms} غرف} بسعر {price}. {firstSentence}`
- Listing/landing title: `{type_plural} {offer} في {city} | {brand}`
Tokens: `{brand} {type} {type_plural} {offer} {city} {district} {area} {bedrooms} {bathrooms} {price} {code} {firstSentence}`.
Per-property overrides win.

### 11.3 الكلمات المفتاحية (keywords)
- Keyword library: keyword, intent (معلوماتي / تجاري / محلي / شرائي), group, target page, priority,
  notes. Import/export CSV.
- Assign a **focus keyword** + secondary keywords to each static page, landing page and property.
- Placement checker per page: in title, H1, meta description, URL slug, first 100 words, image alt,
  internal links pointing to the page. Cannibalisation warning when two pages target the same focus
  keyword.
- `meta keywords` tag is **off** by default (ignored by Google); toggle exists for other engines.

### 11.4 صفحات الهبوط (programmatic landing pages)
Model `SeoLandingPage` (see §13): path (`/properties/riyadh/villa/sale`), filters JSON, H1, intro
rich text (≥ 120 words recommended), FAQ items, focus keyword, meta title/description, indexable,
include in sitemap. «اقتراح صفحات» generates city × type × offer combinations having ≥ 3 published
listings, pre-filled from templates. Thin pages (0 listings) automatically become `noindex` and are
dropped from the sitemap.

### 11.5 تدقيق الصفحات (audit) & per-page score
Score 0–100 per property/landing page with checks: title 50–60 chars, description 120–160 chars,
focus keyword in title/H1/description/slug, ≥ 5 photos with alt, description ≥ 80 words, location
present, structured data valid, canonical set, not orphaned (linked from a landing page), image
weight. List view sorted by lowest score with «إصلاح» links to the editor.

### 11.6 AEO — محركات الإجابة
- FAQ manager: reusable Q&A blocks (question, concise answer ≤ 60 words, long answer) attachable to
  home, landing pages, property types, about. Rendered visibly on the page **and** as `FAQPage`
  JSON-LD.
- Property «ملخص سريع» (answer-first box) auto-generated from specs at the top of each property page:
  e.g. «فيلا للبيع في حي الملقا بالرياض، المساحة 450 م²، 5 غرف نوم، السعر 4,850,000 ر.س، الحالة: متاح».
  Admin can edit the template.
- `HowTo` JSON-LD for the booking steps page; `BreadcrumbList` everywhere.

### 11.7 GEO — محركات الذكاء الاصطناعي التوليدية
- **AI crawler policy**: allow/deny toggles per bot written into `robots.txt`: GPTBot, OAI-SearchBot,
  ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Google-Extended, Applebot-Extended, CCBot,
  Bytespider, Amazonbot (default: allow search/answer bots, deny training-only bots — admin decides).
- **`/llms.txt` editor**: auto-generated draft (company summary, licenses, cities served, property
  types, how to book, key URLs, feed URL) + manual edits; preview.
- **Entity consistency (NAP)**: single source for name/address/phone used in footer, schema, emails;
  warning if Google Business profile URL not set.
- **Organization knowledge**: founding year, service areas, specialties, credentials (FAL, Ejar, CR)
  → `RealEstateAgent` + `Organization` JSON-LD with `sameAs` social profiles and `hasCredential`.
- **Agent profiles** (E-E-A-T): public agent cards with FAL licence and experience.
- **Machine-readable feed** `/feeds/properties.json` (toggle) with canonical URLs and key facts.

### 11.8 التوجيهات والأخطاء (redirects & 404)
Redirect manager (from, to, 301/302, hits) and 404 log (path, hits, referrer, last seen) with
«إنشاء توجيه». Unpublished property → 302 to similar-listings page; deleted → 410.

### 11.9 خرائط الموقع (sitemaps)
Status, last build, URL counts, «إعادة البناء», image sitemap entries, `lastmod` from `updatedAt`.

## 12. Staff & roles

Staff list/invite (email invite via Resend, 72 h link), edit role, reset 2FA, deactivate. Roles page:
system roles (read-only permissions) + custom roles (permission checklist grouped by area).

## 13. Additional Prisma models required by §11 (append to schema in docs/01)

```prisma
model SeoLandingPage {
  id              String   @id @default(cuid())
  path            String   @unique                 // /properties/riyadh/villa/sale
  filters         Json
  h1              String
  introHtml       String
  faqIds          String[]
  focusKeyword    String?
  keywords        String[]
  metaTitle       String?
  metaDescription String?
  ogImageKey      String?
  indexable       Boolean  @default(true)
  inSitemap       Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model SeoPageMeta {                                 // static pages: home, properties, about, contact …
  key             String   @id
  metaTitle       String?
  metaDescription String?
  focusKeyword    String?
  keywords        String[]
  ogImageKey      String?
  faqIds          String[]
  noindex         Boolean  @default(false)
  updatedAt       DateTime @updatedAt
}

model SeoKeyword {
  id         String   @id @default(cuid())
  keyword    String   @unique
  intent     String                                // informational | commercial | local | transactional
  group      String?
  targetPath String?
  priority   Int      @default(2)                  // 1 high … 3 low
  notes      String?
  createdAt  DateTime @default(now())
}

model SeoFaq {
  id           String   @id @default(cuid())
  question     String
  answerShort  String                               // ≤ 60 words, used in JSON-LD
  answerHtml   String?
  scope        String[]                             // ['home','type:villa','landing:<id>', …]
  sort         Int      @default(0)
  isActive     Boolean  @default(true)
}

model SeoRedirect {
  id        String   @id @default(cuid())
  fromPath  String   @unique
  toPath    String
  code      Int      @default(301)
  hits      Int      @default(0)
  createdAt DateTime @default(now())
}

model Seo404 {
  path      String   @id
  hits      Int      @default(1)
  referrer  String?
  lastSeen  DateTime @default(now())
}
```
(`Property` already carries `focusKeyword`, `keywords`, `ogImageKey`, `noindex` — see docs/01.)

`settings.seo` (zod) holds §11.1, §11.2 templates, §11.6 summary template, §11.7 crawler policy,
llms.txt body, feedEnabled.
