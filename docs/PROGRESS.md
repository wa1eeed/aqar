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
| هيكل لوحة التحكم (Vite React RTL + tokens) | ⏳ | لم يبدأ |
| البنية التحتية: docker-compose (dev/prod)، Caddyfile، `.env.example`، CI | ⏳ | لم يبدأ |
| الهجرة الأولى (`prisma migrate`) + تسلسل العقار من 1001 + tsvector/GIN + فهرس الحجز الفريد | ⏳ | تحتاج PostgreSQL يعمل (Docker) |
| قبول المرحلة: `docker compose up` يعطي `/` و`/admin` و`/api/v1/health` | ⏳ | يحتاج Docker + مساحة قرص |

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
