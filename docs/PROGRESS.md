# سجلّ التقدّم — منصة منزلة

يُحدَّث بعد كل مهمة/مرحلة. المرجع: `docs/11-implementation-plan.md` و`docs/12-multi-tenancy.md`.

## تحوّل Multi-Tenant (قيد التنفيذ)

المنصة أصبحت SaaS متعدّد المشتركين (راجع `docs/12`). ما أُنجز وتحقّق منه:

| المهمة | الحالة | ملاحظات |
|---|---|---|
| توثيق المعمارية + تحديث CLAUDE.md/docs 00 | ✅ | `docs/12-multi-tenancy.md` |
| إعادة تشكيل مخطّط Prisma: Tenant/Plan/Subscription/TenantDomain/PlatformAdmin/PlatformIntegration | ✅ | `prisma validate` ناجح |
| `tenantId` + تفرّد لكل مشترك على كل الجداول المملوكة | ✅ | فهارس مركّبة؛ أكواد فريدة لكل مشترك |
| مولّد أكواد `PREFIX-YY-XXXX` (Crockford Base32) | ✅ | مُختبَر |
| سياق المشترك (AsyncLocalStorage) + middleware تحديد المشترك (نطاق/نطاق فرعي/مسار) | ✅ | يدعم النطاقات المخصّصة عبر TenantDomain |
| امتداد Prisma للعزل (يحقن tenantId على النماذج المملوكة) | ✅ | دوال نقية مُختبَرة؛ عميل `prisma.scoped` |
| الإعدادات والتدقيق لكل مشترك | ✅ | مفاتيح مركّبة [tenantId, key] |
| لوحة السوبر-أدمن: إدارة المشتركين (إنشاء/عرض/حالة) + تهيئة مشترك | ✅ | `/api/v1/super/tenants`؛ الحراسة لاحقاً |
| البذر: سوبر-أدمن + تكاملات المنصّة + خطط + مشترك تجريبي مُهيّأ | ✅ | idempotent |
| سياسات RLS في هجرة SQL (دفاع بالعمق) | ⏳ | تحتاج قاعدة بيانات (Docker) |
| مصادقة السوبر-أدمن (تسجيل دخول المنصّة + 2FA) | ⏳ | مرحلة المنصّة |
| توجيه Caddy (on-demand TLS للنطاقات المخصّصة + wildcard) | ⏳ | مع البنية التحتية |
| وعي الواجهة/لوحة المكتب بالمشترك (base path + الهوية) | ⏳ | المرحلتان 3 و8-frontend |
| فوترة اشتراكات المنصّة | ⏳ | يدوي أولاً (راجع QUESTIONS) |

**التحقّق:** backend 16 اختباراً تمر، البناء وESLint نظيفان، `prisma validate` ناجح.

## المرحلة 1 — الهوية والمصادقة (قيد التنفيذ)

| المهمة | الحالة | ملاحظات |
|---|---|---|
| رموز JWT (وصول 15د + تحديث دوّار 14/30يوم) مع كشف إعادة الاستخدام | ✅ | `TokensService`، كوكي `nx_rt` |
| كلمات المرور (Argon2id) + 2FA (TOTP) | ✅ | مُختبَر |
| الحُرّاس العالمية + الديكوريتورات (@Public/@RequirePermissions/@RequirePlatform/@RequireStaff/@CurrentUser) | ✅ | مُختبَر |
| مصادقة الموظف: دخول + تحدّي 2FA + إعداد/تفعيل + تحديث + خروج + /auth/me | ✅ | مُقيّدة بالمشترك؛ إلزام 2FA لـ owner/admin/finance عبر mustSetup2fa |
| مصادقة السوبر-أدمن (منصّة): دخول + 2FA + me | ✅ | typ=platform |
| مصادقة العميل: OTP إرسال/تحقّق + دخول بكلمة مرور + me | ✅ | الإرسال الفعلي عبر Resend في المرحلة 2 (يُسجَّل محلياً) |
| ربط الحُرّاس: الصحّة عامة، الإعدادات (موظف + صلاحية القسم)، المشتركون (سوبر-أدمن) | ✅ | |
| إدارة الموظفين والأدوار (CRUD + دعوة بالبريد) | ⏳ | التالي |
| نسيان/إعادة تعيين كلمة المرور (رابط بريد 30د) | ⏳ | التالي (يحتاج بريد المرحلة 2) |
| AccessScopeService (قيود "own"/"assigned" على الصفوف) | ⏳ | يُستخدم في المرحلة 3+ |
| قبول: المالك يُلزَم بـ2FA؛ موظف لا يقرأ طلبات غيره (e2e) | ⏳ | الجزء الثاني يحتاج Leads (المرحلة 3) |

**التحقّق:** backend 24 اختباراً تمر، البناء وESLint نظيفان.
> ملاحظة: لوحة التحكم تحتاج شاشة تسجيل دخول لتستدعي نقاط `/admin/*` المحميّة (ضمن واجهة المرحلة 1 القادمة).

## محرّك الاستحقاقات (Entitlements) — الباقات (مكتمل الأساس)

طبقة مستقلة عن RBAC والفوترة (راجع `docs/13`). Build once, package dynamically, enforce centrally.

| المهمة | الحالة | ملاحظات |
|---|---|---|
| نماذج: Feature, PlanEntitlement, TenantEntitlement, UsageCounter | ✅ | `prisma validate` ناجح |
| سجلّ الميزات (FEATURE_CATALOG) — طبقة القدرات | ✅ | 10 ميزات (boolean/limit/metered) |
| EntitlementsService (دمج باقة+مشترك، isEnabled/getLimit/assert) + UsageService | ✅ | مُختبَر (دمج) |
| `@RequireFeature` + EntitlementGuard (فرض مركزي) + أخطاء FEATURE_NOT_INCLUDED/LIMIT_REACHED | ✅ | مُختبَر؛ مُرشِّح الأخطاء يُظهر code+upgradeRequired |
| فرض حدّ `staff.max` على إنشاء الموظف (برهان) | ✅ | |
| لوحة السوبر-أدمن: ميزات/باقات/استحقاقات الباقة والمشترك | ✅ | `/api/v1/super/features|plans|...` |
| البذر: سجلّ الميزات + استحقاقات trial/basic/pro | ✅ | |

**التحقّق:** backend 28 اختباراً تمر، البناء وESLint نظيفان.

## المرحلة 2 — بوابة التكاملات والتخزين والبريد (الأساس مكتمل)

كل الاتصالات الخارجية عبر `IntegrationsGateway` (docs/05). منصّي مقابل لكل مشترك (docs/12 §6).

| المهمة | الحالة | ملاحظات |
|---|---|---|
| نواة البوابة: الحلّ + fallback من البيئة + تخزين مؤقّت 60ث + إبطال عند الحفظ | ✅ | |
| غلاف الاستدعاء: قاطع دائرة + سجل `IntegrationCallLog` + حجب الأسرار (§6) | ✅ | مُختبَر |
| مزوّدون فعليون: `maps.osm`, `places.overpass` (أماكن قريبة), `email.resend`, `storage.r2` (presign) | ✅ | |
| مزوّدون مُهيّأون: google, moyasar, rize, rega, ejar, nafath, nafith, sms | ✅ | configSchema/secretsSchema/uiHints؛ testConnection = "بانتظار بيانات الربط" |
| نقاط الإدارة (مكتب): نماذج مُولَّدة، حفظ إعداد/أسرار، تفعيل، اختبار، سجلّات | ✅ | `/admin/integrations` [integrations.manage] |
| نقاط المنصّة (سوبر-أدمن): تكاملات R2/Resend/OSM/Overpass | ✅ | `/super/integrations` |
| الأسرار مشفّرة (AES-256-GCM)، لا تُعاد (قناع ••••1234)، محجوبة في السجلّات | ✅ | تحقّق النطاق يمنع تجاوز المشترك/المنصّة |
| ربط إرسال OTP بالبريد الفعلي عبر البوابة | ✅ | يسقط إلى التسجيل المحلّي إن لم يُهيّأ Resend |
| واجهة الإدارة للتكاملات (React) | ⏳ | النماذج تُولَّد من uiHints؛ الواجهة لاحقاً |
| مهمة فحص الصحّة الدورية (BullMQ كل 15د) + إبطال عبر Redis pub/sub | ⏳ | الإبطال حالياً داخل العملية؛ Redis لاحقاً |
| تخزين الأماكن القريبة في `NearbyCache` لكل عقار | ⏳ | يحتاج العقارات (المرحلة 3) |

**التحقّق:** backend 35 اختباراً تمر، البناء وESLint نظيفان.

### معايير القبول (docs/11)
- [x] تغيير مفتاح Resend في الإدارة يسري دون إعادة تشغيل (إبطال التخزين المؤقّت).
- [x] الأسرار لا تظهر في ردود الـ API ولا السجلّات.
- [x] الأماكن القريبة من التخزين المؤقّت في الاستدعاء الثاني (`NearbyCache` 30 يوماً — المرحلة 3).

---

## المرحلة 3 — العقارات (الـ backend مكتمل الأساس)

| المهمة | الحالة | ملاحظات |
|---|---|---|
| دوال مشتقّة نقيّة (annualised، سعر المتر، slug، ملخّص) | ✅ | مُختبَرة |
| باني الحمولة العامة (يطابق docs/02 §4: price بالريال، priceHalalas، media…) | ✅ | مُختبَر |
| PropertiesService: CRUD + تحقّق specs عبر buildSpecsZod + حقول مشتقّة | ✅ | كود فريد لكل مشترك |
| تغيّر الحالة + سجلّ التاريخ، قواعد النشر (ترخيص الإعلان + فال مطلوبان) | ✅ | |
| تقييد الوكيل على عقاره (AccessScope) + حدّ الباقة properties.max | ✅ | |
| النقاط العامة: config, schema, properties(+فلاتر/فرز/ترقيم), :id, similar, stats, nearby, agents | ✅ | nearby عبر البوابة + NearbyCache |
| إدارة العقارات (قائمة/إنشاء/تعديل/حالة/نشر/حذف) بصلاحيات دقيقة | ✅ | `/admin/properties` |
| المواقع: مدن + إدارة الأحياء | ✅ | `/admin/locations` |
| الوسائط: presign إلى R2 + سجلّ + حذف + تعيين غلاف | ✅ | توليد المتغيّرات (sharp) في عامل لاحقاً |
| بذر 26 عقاراً + 3 وكلاء (من بيانات الواجهة) | ✅ | بيئات غير الإنتاج |
| ربط الواجهة بوضع API (dataSource=api، apiBase=/api/v1/public، MZ.boot، nearby من API) | ✅ | api.js ينفّذ وضع API أصلاً؛ غُلّفت الصفحات بـ MZ.boot؛ منفذ mock محلي (?mock=1) |
| محرّر العقار في لوحة الإدارة (React) | ⏳ | |
| بحث نصّي كامل (tsvector + GIN) | ⏳ | حالياً ILIKE/contains |
| توليد متغيّرات الصور (sharp) في عامل BullMQ | ⏳ | |

**التحقّق:** backend 41 اختباراً تمر، البناء وESLint نظيفان.

### معايير القبول (docs/11)
- [~] كل الصفحات العامة تعمل مقابل الـ API ببيانات مبذورة — الـ backend والواجهة مربوطان؛ يتبقّى
  التحقّق الحيّ عبر `docker compose up` (Docker Desktop متوقّف حالياً).
- [x] الوكيل ينشئ/يعدّل عقاره فقط؛ النشر محجوب دون ترخيص إعلان.

---

## المرحلة 4 — العملاء والإشعارات (الـ backend مكتمل الأساس)

| المهمة | الحالة | ملاحظات |
|---|---|---|
| بوابة لحظية Socket.IO (/ws): غرف public/property/customer/staff/role | ✅ | مصادقة من الرمز في الـ handshake |
| كتالوج الأحداث + القنوات الافتراضية + الأحداث المعاملاتية | ✅ | مُختبَر (docs/06 §3) |
| NotificationsService.notify (in-app + بثّ لحظي + بريد حسب التفضيلات) | ✅ | البريد عبر البوابة (Resend) best-effort |
| مراكز الإشعارات (إدارة + عميل) + التفضيلات + البثّ | ✅ | `/admin/notifications`, `/me/notifications` |
| الطلبات: POST /public/leads (تطبيع جوال، توجيه/إسناد، إنشاء معاينة) | ✅ | إشعار lead.created/viewing.requested للوكيل والمدراء |
| الطلبات (إدارة): قائمة/تفاصيل/مرحلة/إسناد/أنشطة بصلاحيات وتقييد الوكيل | ✅ | `/admin/leads` |
| المعاينات: تقويم + تأكيد/إكمال/إلغاء | ✅ | تأكيد → viewing.confirmed للعميل (in-app + بريد) |
| المفضّلة والبحوث المحفوظة (عميل) | ✅ | `/me/favorites`, `/me/saved-searches` |
| عملاء الإدارة (قائمة/تفاصيل/حالة) | ✅ | `/admin/customers` [customers.*] |
| حالة العقار اللحظية على الصفحات العامة | ✅ | بثّ property.updated إلى غرفة العقار |
| عامل البريد (BullMQ + إعادة محاولة) + قوالب react-email | ⏳ | حالياً إرسال مباشر best-effort |
| لوحة KPIs + تصدير CSV | ⏳ | |
| واجهة: نافذة دخول OTP، جرس/قائمة الحساب، صفحات account/، مزامنة المفضّلة | ⏳ | docs/08 §3–5 — جولة واجهة |

**التحقّق:** backend 45 اختباراً تمر، البناء وESLint نظيفان.

### معايير القبول (docs/11)
- [x] طلب معاينة → إشعار في إدارة الوكيل (in-app + بثّ لحظي ≤ ثوانٍ) + بريد (عند تهيئة Resend).
- [x] العميل يستلم viewing.confirmed (in-app + بريد) بعد تأكيد الإدارة.

---

## المرحلة 5 — الحجز والدفع (الـ backend مكتمل الأساس)

| المهمة | الحالة | ملاحظات |
|---|---|---|
| حساب العرض (ثابت/نسبة/حد أدنى-أعلى، تجاوز العقار) + تحقّق IBAN (mod-97) | ✅ | مُختبَر |
| الحسابات البنكية (CRUD) | ✅ | `/admin/bank-accounts` [settings.payments] |
| العرض (quote) + طرق الدفع المتاحة حسب الإعدادات والتكامل | ✅ | `POST /me/bookings/quote` |
| إنشاء الحجز مع قفل الصف (FOR UPDATE) → 409 عند التزامن | ✅ | فحص حجز نشط داخل المعاملة |
| محوّل Moyasar (وضع الفاتورة) + PaymentsService.reconcile | ✅ | عبر البوابة؛ idempotent، فحص المبلغ/العملة، تنبيه payment.anomaly |
| آثار حالة العقار (reserved/sold/rented/available) + سجلّ التاريخ | ✅ | ضمن نفس المعاملة |
| التحويل البنكي: presign + رفع + مراجعة (اعتماد/رفض) + تمديد المهلة | ✅ | إشعار العميل + المالية |
| الاسترداد (كامل/جزئي) | ✅ | `/admin/payments/:id/refund` [payments.refund] |
| webhook Moyasar (تحديد المشترك من الحمولة، idempotent) + /me/payments/:id/verify | ✅ | `/webhooks/moyasar` |
| نقاط العميل (/me/bookings) والإدارة (تأكيد/إكمال/إلغاء) | ✅ | بثّ booking.updated |
| تحرير الحجوزات منتهية المهلة (releaseExpiredHolds) | ✅ (دالة) | تُجدوَل في العامل (BullMQ/cron) لاحقاً |
| إيصالات PDF (عامل + Chromium) + بريد الإيصال | ⏳ | يُخصَّص receiptNumber؛ PDF لاحقاً |
| Rize (HTTP) + وضع Moyasar المضمّن الكامل | ⏳ | مُهيّأ |
| واجهة: booking.html، account/bookings، account/booking | ⏳ | جولة واجهة |

**التحقّق:** backend 50 اختباراً تمر، البناء وESLint نظيفان.

### معايير القبول (docs/11)
- [~] دفعة Moyasar sandbox تؤكّد الحجز وتحجز العقار — المنطق جاهز (reconcile → confirm → reserved)؛ يحتاج تشغيلاً حيّاً بمفاتيح sandbox.
- [x] حجز متزامن → 409 (قفل الصف + فحص الحجز النشط).
- [x] اعتماد/رفض التحويل البنكي يُشعر العميل.
- [x] الحجوزات منتهية المهلة تُحرَّر (دالة جاهزة للجدولة).

---

> ملاحظات: `data/properties.js` ما زال مُضمّناً في HTML (غير ضارّ؛ يُستخدم فقط مع ?mock=1).
> `/theme.css` و/public/leads وربط تسجيل الدخول في الواجهة ضمن المراحل 4–6.
> النشر والتوسّع السحابي: راجع `docs/14-deployment-scaling.md` (القاعدة Postgres؛ Coolify ثم AWS/GCP/Alibaba).

---


## المرحلة 0 — الأساسات (قيد التنفيذ)

| المهمة | الحالة | ملاحظات |
|---|---|---|
| إعداد pnpm monorepo (workspace، tsconfig، Prettier، ESLint) | ✅ | `package.json`، `pnpm-workspace.yaml`، `tsconfig.base.json`، `eslint.config.mjs` |
| `packages/schema` — نقل TypeScript + helpers + `buildSpecsZod` | ✅ | يبني (CommonJS)، 7 اختبارات تمر |
| توليد `frontend/assets/js/schema.js` + اختبار المزامنة | ✅ | `build:frontend` عبر tsx؛ sync test يفشل CI إن تقادم الملف |
| مخطّط Prisma (docs/01 + نماذج SEO docs/07 §13) | ✅ | `prisma validate` ناجح؛ enums مُختبَرة ضد الـ schema |
| خدمات common: money، pagination، correlation-id، error filter | ✅ | شكل الخطأ مطابق docs/02 |
| خدمة التشفير (AES-256-GCM) + خدمة التدقيق (AuditLog) | ✅ | حجب الأسرار مُطبّق |
| وحدة الإعدادات: 13 مخطّط zod + الافتراضيات + service + controller | ✅ | كل الأقسام في docs/07 §10؛ 4 اختبارات تمر |
| الأدوار والصلاحيات (docs/03) | ✅ | `permissions.ts` لإعادة استخدامه في حارس المرحلة 1 |
| نقاط الصحّة + bootstrap (main/worker) + Swagger + env | ✅ | `/api/v1/health`، `/api/docs` |
| البذرة (seed): أدوار، مدن/أحياء، إعدادات، سجلّ تكاملات، مالك | ✅ | idempotent؛ لم تُشغَّل بعد (تحتاج قاعدة بيانات) |
| هيكل لوحة التحكم (Vite React RTL + tokens) | ✅ | لوحة المكتب + السوبر-أدمن؛ typecheck/build/lint ناجح، base /admin/ |
| البنية التحتية: docker-compose (dev/prod)، Caddyfile، `.env.example`، CI | ✅ | dev config صالح؛ Dockerfile، RLS script، GitHub Actions |
| الهجرة الأولى (`prisma migrate`) + tsvector/GIN + فهرس الحجز الفريد | ⏳ | تُولَّد عند توفّر PostgreSQL؛ dev compose يستخدم `db push` مؤقتاً |
| قبول المرحلة: `docker compose up` يعطي `/` و`/admin` و`/api/v1/health` | ⏳ | الملفات جاهزة ومُتحقَّق من صحّتها؛ التشغيل الفعلي يحتاج تشغيل Docker Desktop (الـ daemon متوقّف) |

### معايير القبول (docs/11)
- [ ] `docker compose up` يعطي `/`, `/admin`, `/api/v1/health` محلياً.
- [x] `frontend/assets/js/schema.js` المُولَّد مطابق سلوكياً (الصفحات الحالية تعمل).

### محقَّق (build/lint/test)
- `pnpm -r test` → 14 اختباراً تمر (schema 7، backend 7).
- `pnpm --filter @manzilah/schema build` و`pnpm --filter @manzilah/backend build` ينجحان.
- ESLint نظيف على الحزمتين. `prisma validate` ناجح.

### معوّقات بيئية
- **مساحة القرص**: القرص ممتلئ (~93% بعد تنظيف مخزن pnpm). تشغيل Docker (PostgreSQL/Redis + صور
  البناء) والهجرات يتطلّب تحرير مساحة إضافية على الجهاز. راجع `docs/QUESTIONS.md`.
