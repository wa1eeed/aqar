# 13 — محرّك الاستحقاقات (Entitlements) والباقات

المبدأ: **Build once, package dynamically, enforce centrally** — نبني الميزة مرّة، نوزّعها على أي عدد
من الباقات ديناميكياً من قاعدة البيانات، ونفرض حدودها مركزياً على الخادم. قاعدة برمجية واحدة لكل
الباقات؛ لا نسخ مختلفة ولا `if (plan === 'pro')`.

## 1. الطبقات الثلاث (منفصلة تماماً)

| الطبقة | السؤال | المكان في الكود |
|---|---|---|
| **Capabilities** (القدرات) | ما الذي يستطيع النظام فعله؟ | `FEATURE_CATALOG` (كود) → جدول `Feature` |
| **Entitlements** (الاستحقاقات) | ما الذي تستحقّه باقة المشترك وحدوده؟ | `PlanEntitlement` + `TenantEntitlement` → `EntitlementsService` |
| **Permissions** (الصلاحيات، RBAC) | ما الذي يُسمح للمستخدم بتنفيذه داخل مكتبه؟ | `Role.permissions` + `PermissionsGuard` (docs/03) |

قد يكون المشترك على باقة Enterprise ومع ذلك لا يصل موظف عادي إلى إعداد ما إن لم يمنحه مديره الصلاحية.
لذلك **لا نخلط Entitlements بـ RBAC**. والفوترة (Billing) طبقة رابعة منفصلة.

## 2. نموذج البيانات (docs/01)

- `Feature` — سجلّ الميزات (من الكود). النوع: `boolean | limit | metered`.
- `Plan` + `PlanEntitlement(planId, featureKey, value)` — قيمة الميزة لكل باقة.
- `Subscription(tenantId → plan)` — باقة المشترك وحالته.
- `TenantEntitlement(tenantId, featureKey, value, expiresAt)` — استثناءات/إضافات (add-ons) تَغلب الباقة.
- `UsageCounter(tenantId, key, value, period)` — قياس الاستهلاك (للحدود المقيسة والاستهلاك المدفوع).
- قيمة `value`: `true/false` (boolean)، عدد أو `null`=بلا حدّ (limit)، حصّة عددية (metered).

## 3. الفرض المركزي

```ts
// ميزة تشغيل/إيقاف
@RequireFeature('auctions.enabled')
@Post('auctions') createAuction() { … }   // EntitlementGuard يرفض بـ 403 FEATURE_NOT_INCLUDED

// حدّ عددي (قبل الإنشاء)
await entitlements.assertWithinLimit(tenantId, 'staff.max', currentStaffCount); // يرمي LIMIT_REACHED
```

- `EntitlementsService.resolve(tenantId)` = دمج استحقاقات الباقة ثم تجاوزات المشترك (الأخيرة تَغلب).
- شكل الخطأ: `{ error: { code: 'FEATURE_NOT_INCLUDED'|'LIMIT_REACHED', message, details: { upgradeRequired:true, feature, limit? } } }`.
- حتى الاستدعاء المباشر لـ API من باقة أدنى يُرفض (الفرض على الخادم لا في الواجهة فقط).

## 4. لوحة السوبر-أدمن

`/api/v1/super`: `GET /features` (السجل)، `GET/POST /plans`، `PUT /plans/:id/entitlements`،
`GET/PUT /tenants/:id/entitlements`. تُدار الباقات والحدود من اللوحة دون تعديل كود أو إعادة نشر —
لكن تُفعَّل **ميزات مبنية برمجياً فقط** (موجودة في `FEATURE_CATALOG`)؛ لا تُخترع ميزة من اللوحة.

## 5. إضافة ميزة جديدة (الوصفة)

1. ابنِ الميزة في الكود.
2. سجّلها في `FEATURE_CATALOG` (key, nameAr, type, category) — تُبذر إلى `Feature`.
3. احمِ نقاطها بـ `@RequireFeature('key')` أو `assertWithinLimit` للحدود.
4. اضبط قيمتها لكل باقة من لوحة السوبر-أدمن (أو في البذر الافتراضي).

لا تربط الميزة برقم الباقة؛ اربطها بمفتاح قدرة (capability key) مثل `seo.advanced`.
