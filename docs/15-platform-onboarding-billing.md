# 15 — انضمام المكاتب، الباقات والمميزات، ودورة حياة الاشتراك

> هذا المستند هو **مرجع الحقيقة** للمميزات التي بُنيت في مرحلة إطلاق الـSaaS، ويُحدِّث/يوسّع ما ورد
> في `docs/03` (المصادقة) و`docs/07` (اللوحات) و`docs/12` (تعدّد المستأجرين) و`docs/13` (الاستحقاقات).
> أي تعارض مع النصّ الأقدم: **هذا المستند يَغلب** لهذه المميزات.

---

## 1. تسجيل المكاتب الذاتي (Self-service onboarding)

> **تحديث يخالف `docs/12`:** كان منصوصاً «لا تسجيل ذاتي — السوبر-أدمن ينشئ المكاتب».
> **صار:** تسجيل ذاتي علني للمكاتب/الوسطاء/الشركات، مع **تفعيل يدوي** من السوبر-أدمن بعد المراجعة.

- **الواجهة:** `platform/register.html` (نموذج احترافي بخط ثمانية، RTL). حقول السوق السعودي:
  اسم المنشأة، **نوع المنشأة** (`broker` وسيط / `office` مكتب / `company` شركة)، المدينة،
  **السجل التجاري** (اختياري)، **رقم رخصة فال** (اختياري)، **النطاق الفرعي المطلوب** (slug لاتيني
  بمعاينة حيّة `slug.aqaar.online`)، اسم مسؤول التواصل، الجوال، البريد، كلمة المرور، واختيار الباقة،
  والموافقة على الشروط. أزرار «اشترك الآن / ابدأ الآن / الباقات» في الموقع التسويقي تؤدّي إليها
  (ورابط قصير `/register`).
- **النقطة:** `POST /api/v1/public/register` (عامّة، بلا مصادقة، بلا مستأجر). تحقّق zod، يُولّد كوداً
  فريداً من الـslug، ويُنشئ `Tenant` بحالة **`pending`** + حقول المنشأة + حساب المالك
  (`provisionTenantDefaults`: الأدوار، الإعدادات، سجلّ التكاملات، المالك) + اشتراك `trialing` على
  الباقة المختارة. يعيد `{ ok, status:'pending', office, message }`. عند تكرار الـslug/البريد → خطأ واضح.
- **حالة `pending`:** قيمة جديدة في `enum TenantStatus` (pending → trial → active → suspended → cancelled).
  المكتب المسجَّل يبقى «قيد المراجعة» حتى يفعّله السوبر-أدمن (أو عند تغيير باقته).
- **حقول `Tenant` الجديدة:** `officeType, commercialReg, falLicense, city, phone, contactName, website`
  (كلها اختيارية/nullable).

### onboarding بعد الدخول
- قائمة تهيئة على لوحة المكتب (`admin/src/components/Onboarding.tsx`) تظهر بعد أول دخول: أكمل الهوية →
  حسّن الظهور (SEO) → أضف أول عقار → ادعُ الفريق → فعّل الحجز والمدفوعات. واعية بالصلاحيات وقابلة للإخفاء
  (localStorage).

---

## 2. الدخول الموحّد للمكاتب

> **تحديث يوسّع `docs/03`:** دخول موظفي المكاتب من **رابط موحّد واحد** لا من نطاق كل مكتب.

- الرابط: `https://aqaar.online/login` (تحويل 308 إلى `/admin/login`). زر «دخول المكاتب» يشير إليه.
- **تحديد المستأجر من حساب الموظف لا من الدومين:**
  - `StaffAuthService.login`: إن لم يوجد مستأجر في السياق (الجذر) يُحلّ الموظف **من بريده عبر كل المكاتب**
    (البريد فريد عملياً؛ عند تطابق أكثر من مكتب → خطأ يطلب الدخول من رابط المكتب).
  - `JwtAuthGuard`: على الطلبات المصادَقة، إن لم يحمل الـHost مستأجراً يُضبط المستأجر من `tid` في توكن
    الموظف (`TenantContext.setTenantId`) → يبقى **عزل البيانات** سليماً على الرابط الموحّد.
- **النطاقات الفرعية** تبقى **فقط لموقع عرض عقارات المكتب العام (storefront)**، لا لتسجيل الدخول.
- **السوبر-أدمن** يدخل من `https://aqaar.online/super` (مصادقة منصّة منفصلة، بلا مستأجر).
- **حالة الدخول في الواجهة التسويقية:** `GET /api/v1/auth/session` (عامّة؛ تقرأ كوكي `nx_rt` دون تدوير)
  تعيد `{ loggedIn, name }`. عند الدخول يتحوّل زر «دخول المكاتب» إلى قائمة حساب (أيقونة + اسم + «لوحة
  التحكم» + «تسجيل الخروج»).

---

## 3. لوحة السوبر-أدمن (`/super`)

> **تحديث يوسّع `docs/07`.** صفحة مستقلة (`platform/super.html`، خط ثمانية) تتصل بالـAPI بـ`Bearer`.

- **الدخول:** `POST /api/v1/auth/platform/login` (+ `platform/2fa` إن فُعّل).
- **المكاتب:** جدول بتبويبات (قيد المراجعة / نشطة / الكل) ومؤشرات (إجمالي/قيد المراجعة/نشطة/موقوفة).
  إجراءات لكل مكتب: **تفعيل** (`PATCH /super/tenants/:id/status` = active) / **إيقاف** (suspended) /
  **الباقة** (نافذة تغيير/ترقية).
- **الباقات والمميزات:** **مصفوفة** (الميزات صفوف × الباقات أعمدة). كل خانة: مفتاح on/off للميزات
  المنطقية، أو حقل رقمي للحدود (`∞` = بلا حدّ). **أي ميزة جديدة في `FEATURE_CATALOG` تظهر تلقائياً.**
  الحفظ → `PUT /super/plans/:id/entitlements`. وزر **«+ باقة جديدة»** → `POST /super/plans`.
- **إعدادات المنصة والعلامة:** محرّر `PlatformSetting` (مفتاح `branding`): الاسم، الشعار، الأيقونة،
  **صورة المشاركة OG**، الوصف، الكلمات المفتاحية، التواصل. `GET/PUT /super/settings/branding`؛ ويقرؤها
  الموقع التسويقي عبر `GET /public/platform/branding`.

---

## 4. دورة حياة الاشتراك (الفوترة اليدوية حالياً)

- `Subscription`: `planId`, `status` (trialing/active/past_due/cancelled), **`currentPeriodEnd`** (الانتهاء), `cancelAt`.
- **تغيير/ترقية الباقة:** `PUT /api/v1/super/tenants/:id/plan` (body: `planKey`, `periodDays?`).
  يضبط باقة الاشتراك إلى active، ويُجدّد `currentPeriodEnd` إن مُرّرت `periodDays`، **ويُفعّل** مكتباً
  `pending`/`suspended` تلقائياً، ويحدّث `Tenant.planKey`.
- **التجميد بعد الانتهاء:** كرون كل ساعة (`JobsService.freezeExpiredSubscriptions`) يبحث عن اشتراكات
  `currentPeriodEnd < الآن` بحالة active/trialing → يضعها `past_due` **ويعلّق المكتب** (`status = suspended`).
  إعادة التفعيل تتم بتجديد الباقة من السوبر-أدمن.

---

## 5. المميزات كموديولز (طبقة القدرات/الاستحقاقات)

> يؤكّد ويطبّق `docs/13`. **ابنِ مرّة، غلّف ديناميكياً، افرض مركزياً.**

**وصفة إضافة أي ميزة جديدة كموديول:**
1. أضِف مفتاحها إلى `backend/src/modules/entitlements/feature-catalog.ts` (`{ key, nameAr, type, category }`
   حيث `type` ∈ boolean | limit | metered).
2. ابنِ الميزة واحمِها مركزياً: `entitlements.assertFeature(tenantId, 'key')` للمنطقية، أو
   `entitlements.assertWithinLimit(tenantId, 'key.max', current)` للحدود. **لا تستخدم `if (plan === 'pro')` أبداً.**
3. تظهر الميزة تلقائياً في مصفوفة السوبر-أدمن → فعّلها/اضبط حدّها لكل باقة.

**القيم الافتراضية (مهم):** `EntitlementsService.resolve` يدمج استحقاقات الباقة + تجاوزات المشترك.
ميزة بلا استحقاق في الباقة:
- **منطقية** → `isEnabled` = false → **مُعطّلة افتراضياً** (آمن، لا تتسرّب للباقات).
- **حدّ** → `getLimit` = null → **بلا حدّ افتراضياً** (فاضبط الحدّ في كل باقة عند إضافته).

---

## 6. نقاط API الجديدة (تُضاف لـ`docs/02-api.md`)

| الطريقة | المسار | المصادقة | الوصف |
|---|---|---|---|
| POST | `/api/v1/public/register` | عامّة | تسجيل مكتب (pending + مالك + اشتراك) |
| GET | `/api/v1/public/platform/branding` | عامّة | علامة المنصة للموقع التسويقي |
| GET | `/api/v1/auth/session` | عامّة (كوكي) | حالة جلسة المكتب `{loggedIn,name}` |
| GET/PUT | `/api/v1/super/settings/branding` | منصّة | قراءة/تعديل علامة وSEO المنصة |
| PUT | `/api/v1/super/tenants/:id/plan` | منصّة | تغيير/ترقية باقة مشترك (+تجديد) |

(موجودة مسبقاً وتُستخدم الآن من الواجهات: `PATCH /super/tenants/:id/status`,
`GET/POST /super/plans`, `PUT /super/plans/:id/entitlements`, `GET/PUT /super/tenants/:id/entitlements`,
`GET /super/features`, `PATCH /admin/settings/branding`, `PATCH /admin/settings/seo`.)

---

## 7. الموقع التسويقي والـSEO/AEO/GEO

- `platform/` موقع تسويقي مستقل (خط ثمانية، هوية الموقع): هيرو (لقطة المنصة الفعلية تتمرّر + شخصية
  معزولة)، مميزات، كيف يعمل، باقات حقيقية، تواصل. يُخدَم على الجذر `aqaar.online`.
- SEO قوي في الرأس: عنوان/وصف/كلمات مفتاحية، canonical، **OG + Twitter cards** مع **صورة OG مولّدة**
  (`assets/img/og.jpg`) وأيقونة (`favicon.svg`)، و**JSON-LD** (Organization / WebSite / SoftwareApplication / FAQ).
- للمشترك: إعدادات `branding` و`seo` (وحدات الإعدادات الموجودة) تُحرَّر الآن من لوحة المكتب
  (`admin/src/pages/settings/BrandingSettingsPage.tsx` و`SeoSettingsPage.tsx`)، وتشمل مفاتيح روبوتات
  الذكاء الاصطناعي (GEO/AEO) و`llms.txt`. و`seo.service` يخدم meta/OG/JSON-LD/sitemap/robots لكل مكتب.

---

## 8. النشر (يُكمّل `docs/COOLIFY.md`)

- Coolify (compose `infra/docker-compose.coolify-extdb.yml`) + Postgres مُدار منفصل + شبكة `coolify`
  + Traefik يملك 80/443. الدومين على **خدمة `caddy`** (لا `api`).
- أمر بدء الـAPI: **`prisma db push`** دائماً (لا ترحيلات بعد) ثم `node dist/main.js` — يطبّق تغييرات المخطّط.
- `infra/Caddyfile.coolify`: `/login` و`/admin` → تحويلات، الجذر → `platform` التسويقي، باقي النطاقات →
  storefront، و`/admin/*` → SPA. **`Cache-Control: no-store`** على صفحات HTML (منع نسخ قديمة فارغة).
- Cloudflare: برتقالي (Proxied) مع **SSL/TLS = Full (strict)** — لا Flexible.
- **البذر مرّة واحدة بعد النشر:** `docker exec <api> pnpm db:seed`.
