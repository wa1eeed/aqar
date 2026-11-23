# 12 — تعدّد المشتركين (Multi-Tenancy) ولوحة السوبر-أدمن

يُحوّل هذا المستند المنصة من "شركة واحدة" إلى **منصة SaaS** تستضيف عدّة مكاتب عقارية (مشتركين / tenants)
مركزياً. **يَعلو هذا المستند على أي تعارض** مع الصياغة القديمة في `docs/00` و`CLAUDE.md` التي كانت
تنصّ على "شركة واحدة" أو "لا multi-tenant".

## 1. المفاهيم

| المصطلح | الكود | الوصف |
|---|---|---|
| مشترك / مكتب عقاري | `Tenant` | عميل المنصة: مكتب عقاري له موقعه ولوحته المعزولة |
| سوبر-أدمن (مشغّل المنصة) | `PlatformAdmin` | يدير المشتركين والاشتراكات والمنصة — ليس مرتبطاً بمشترك |
| موظف المكتب | `StaffUser` (مرتبط بـ `tenantId`) | مستخدمو لوحة المكتب (owner/agent…) داخل مشترك واحد |
| عميل المكتب | `Customer` (مرتبط بـ `tenantId`) | زوّار/عملاء موقع المكتب |
| خطة الاشتراك | `Plan` / `Subscription` | باقة المشترك وحدودها وحالتها |

- لوحة **المكتب** الحالية (admin) تبقى كما هي، لكنها تعمل في سياق مشترك واحد تلقائياً.
- لوحة **السوبر-أدمن** جديدة (`/super`) تدير المشتركين والخطط والنطاقات والفوترة وصحّة المنصة.

## 2. عزل البيانات — قاعدة مشتركة + `tenantId` + RLS

- قاعدة PostgreSQL واحدة. كل جدول مملوك لمشترك يحمل عمود `tenantId`.
- **طبقتان من الفرض (defense-in-depth):**
  1. **على مستوى التطبيق:** `TenantContext` (AsyncLocalStorage) يحمل `tenantId` للطلب الحالي، وامتداد
     Prisma (`tenantGuardExtension`) يحقن `tenantId` تلقائياً في كل `create` ويضيف فلتر `tenantId`
     على كل `find/update/delete` للنماذج المملوكة لمشترك. أي استعلام بلا سياق مشترك على جدول مملوك = خطأ.
  2. **على مستوى القاعدة (RLS):** سياسات Row-Level Security على كل جدول مملوك:
     `USING (tenant_id = current_setting('app.tenant_id', true))`. يضبط التطبيق المتغيّر عبر
     `SET LOCAL app.tenant_id = '<id>'` داخل معاملة لكل طلب. تُطبَّق في هجرة SQL مخصّصة.
- جداول **المنصة** (غير مملوكة لمشترك، لا RLS للمشترك): `Tenant`, `TenantDomain`, `Plan`,
  `Subscription`, `PlatformAdmin`, `PlatformIntegration`, `PlatformAuditLog`, `City`, `District`
  (مرجعية مشتركة), `WebhookEvent` (يُربط بمشترك عبر التكامل).

## 3. تحديد المشترك (Tenant resolution) والتوجيه

يدعم ثلاث طرق، تُحلّ بهذا الترتيب في middleware قبل أي منطق:

1. **نطاق مخصّص / نطاق فرعي:** مطابقة `Host` مع `TenantDomain.host` (مثل `aqar-office.com` أو
   `office.manzilah.sa`). عند التحقّق (`verifiedAt`) يُفعّل.
2. **نطاق فرعي افتراضي:** `<slug>.<PLATFORM_BASE>` → مشترك بالـ `slug`.
3. **مسار جذر:** `https://platform/<slug>/...` → مشترك بالـ `slug`، مع **قائمة كلمات محجوزة**
   (`api`, `admin`, `super`, `assets`, `theme.css`, `robots.txt`, `sitemap*`, `llms.txt`, `feeds`,
   `t`) لا تصلح slugs. يُدعم أيضاً `/t/<slug>/...` صراحةً لإزالة اللبس.

- طلبات `/api/v1/public/*` و`/api/v1/<tenant-admin>/*` تحمل المشترك عبر ترويسة `X-Tenant` أو من
  أصل الطلب (Origin/Host) الذي حلّه الـ gateway. نقاط `/api/v1/super/*` و`/api/v1/platform/*` بلا مشترك.
- شهادات TLS: Caddy `on-demand TLS` للنطاقات المخصّصة + wildcard `*.PLATFORM_BASE` للنطاقات الفرعية.

## 4. الترقيم (معرّفات لكل مشترك، فريدة وغير متكرّرة)

- كل مشترك له `code` قصير (مثل `MZ`, `AQ`) يُدخله السوبر-أدمن عند الإنشاء (فريد عبر المنصة).
- **العقارات:** `Property.code = {tenant.code}-{YY}-{RAND6}` حيث `YY` = آخر رقمين من السنة،
  `RAND6` = 6 محارف من أبجدية Crockford Base32 (بلا محارف ملتبسة I/L/O/U). مثال: `MZ-26-7K4Q2P`.
  فريد ضمن `@@unique([tenantId, code])` مع إعادة توليد عند التصادم.
- **الحجوزات:** `Booking.number = B-{YY}-{RAND6}` لكل مشترك. **الإيصالات:** `R-{YY}-{RAND6}`.
  **الطلبات (Leads):** `L-{YY}-{RAND6}`. كلها فريدة ضمن `@@unique([tenantId, number])`.
- المفتاح الداخلي `Property.id` يبقى عدداً صحيحاً عاماً (غير مكشوف علناً)؛ الروابط العامة تستخدم `code`.
- `Customer`: فريد لكل مشترك على البريد/الجوال (`@@unique([tenantId, email])`, `@@unique([tenantId, phone])`).
  موظف المكتب كذلك (`@@unique([tenantId, email])`).

## 5. التخزين (R2 موحّد للمنصة، مجلد لكل مشترك)

- دلو R2 واحد للمنصة (تكامل **منصّي** `storage.r2` في `PlatformIntegration`، لا لكل مشترك).
- مسار كل مفتاح: `tenants/{tenantId}/properties/{propertyId}/{variant}.webp`. كل مفاتيح الوسائط
  تبدأ بـ `tenants/{tenantId}/` لعزل منطقي داخل الدلو. CDN العام يخدم دلو `media` العام بنفس التشعيب.

## 6. التكاملات — منصّية مقابل لكل مشترك

| النطاق | المكان | أمثلة |
|---|---|---|
| منصّي (مشترك للجميع) | `PlatformIntegration` (key @id) | `storage.r2`, `email.resend` (البنية)، `maps.osm`, `places.overpass` |
| لكل مشترك | `Integration` (`@@id([tenantId, key])`) | `payments.moyasar`, `payments.rize`, `gov.rega`, `gov.ejar`, `gov.nafith`, `identity.nafath`, `maps.google`, `places.google` |

كل مكتب يحصّل أمواله بحسابه (Moyasar الخاص به) ويستخدم تراخيصه (فال/إيجار) الخاصة.

## 7. الاشتراكات والخطط (لوحة السوبر-أدمن)

- `Plan`: مفتاح، اسم، سعر شهري (هللات)، حدود (`maxListings`, `maxStaff`)، مزايا (JSON)، مفعّل.
- `Subscription`: مشترك ↔ خطة، حالة (`trialing/active/past_due/cancelled`)، نهاية الفترة.
- حالة المشترك `Tenant.status` (`trial/active/suspended/cancelled`) تتحكّم بالوصول: المشترك المعلّق
  → موقعه يعرض صفحة "الخدمة موقوفة" ولوحته للقراءة فقط.
- فوترة اشتراكات المنصّة (تحصيل من المكاتب) — **خارج نطاق هذه المرحلة**؛ يُدار يدوياً أولاً، وتُضاف
  بوابة لاحقاً. (يُسجَّل في `docs/QUESTIONS.md`.)

## 8. المصادقة

- **السوبر-أدمن:** `PlatformAdmin` بمصادقة منفصلة (نفس معايير docs/03: Argon2id + 2FA إلزامي)،
  رموز بنطاق المنصة، لا تصل لبيانات المشتركين إلا عبر أدوات إدارية مُدقّقة.
- **موظف المكتب / العميل:** كما docs/03، لكن كل الاستعلامات مُقيّدة بـ `tenantId` للمشترك المُحلّل.
  الرمز يحمل `tid` (tenant id). رمز مشترك لا يعمل على مشترك آخر.

## 9. البذر (seed)

- سوبر-أدمن واحد من البيئة (`SEED_PLATFORM_ADMIN_EMAIL` / `_PASSWORD`).
- تكاملات المنصّة (`storage.r2`, `email.resend`, `maps.osm`, `places.overpass`).
- خطط افتراضية (`trial`, `basic`, `pro`).
- مشترك تجريبي واحد (`demo`, code `MZ`) مع أدواره النظامية ومالكه وإعداداته الافتراضية وتكاملاته
  المعطّلة والمدن/الأحياء المرجعية. (staging يبذر العقارات التجريبية تحت هذا المشترك.)

## 10. أثر على المراحل

- يُضاف **tenantId** وفرضه إلى كل خدمة في المراحل 1–7 (جزء من تعريف كل مهمة).
- تُضاف **المرحلة -1 / 0.5 "منصّة ومشتركون"** قبل المرحلة 1: نماذج المشترك، السياق، الـ RLS،
  لوحة السوبر-أدمن (مشتركون/خطط/نطاقات)، وتسجيل دخول المشترك عبر النطاق.
- لوحة المكتب والواجهة العامة تصبحان "واعيتين بالمشترك" (base path / الهوية من إعدادات المشترك).

---

## تحديث — التسجيل الذاتي للمكاتب (يَغلب النصّ أعلاه)

راجع `docs/15 §1`. **أصبح هناك تسجيل ذاتي علني** للمكاتب عبر `POST /api/v1/public/register` وصفحة
`platform/register.html`، مع حالة جديدة **`pending`** في `TenantStatus` (pending → trial → active →
suspended → cancelled) و**تفعيل يدوي** من السوبر-أدمن. حقول `Tenant` الجديدة: `officeType, commercialReg,
falLicense, city, phone, contactName, website`. ونموذج `PlatformSetting` (علامة/SEO المنصة).
