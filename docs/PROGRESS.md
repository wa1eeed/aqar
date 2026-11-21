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
