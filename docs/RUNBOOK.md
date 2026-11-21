# RUNBOOK — النشر والتشغيل (staging → production)

مرجع: `docs/10` و`docs/14`. البنية: Docker Compose (Coolify على VPS الآن؛ قابلة للنقل سحابياً).

## 1. المتطلّبات قبل الإطلاق
- [ ] `infra/.env` مملوء (راجع `infra/.env.example`): `DATABASE_URL`, `REDIS_URL`, `APP_ENCRYPTION_KEY` (32 بايت)، `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`، `PLATFORM_BASE_DOMAIN`، بذور السوبر-أدمن والمالك.
- [ ] PostgreSQL 16 مع امتدادَي `pg_trgm` و`unaccent`.
- [ ] تكاملات المنصّة من لوحة السوبر-أدمن: `storage.r2` و`email.resend` (نطاق موثّق SPF/DKIM).
- [ ] مفاتيح مزوّدي المشترك (Moyasar…) تُدخل من لوحة المكتب (مُشفّرة).

## 2. أول نشر
```bash
cd infra
cp .env.example .env   # ثم املأ القيم
docker compose build
docker compose up -d postgres redis
# تهيئة المخطّط (حتى تُولَّد هجرات Prisma): db push
docker compose run --rm api pnpm exec prisma db push
# البذر (سوبر-أدمن + خطط + تكاملات المنصّة + مشترك)
docker compose run --rm api pnpm db:seed
docker compose up -d
```
- التحقّق: `curl -fsS http://localhost:3000/api/v1/health` → `{"status":"ok","db":"up"}`.
- (اختياري، تحصين) تطبيق RLS بعد توصيل `SET LOCAL app.tenant_id`: `psql "$DATABASE_URL" -f infra/sql/rls.sql`.

## 3. الترقية (نشر جديد)
```bash
docker compose pull        # أو build للصور المحلية
docker compose run --rm api pnpm exec prisma migrate deploy   # عند توفّر الهجرات
docker compose up -d
curl -fsS https://<domain>/api/v1/health   # اختبار دخان
```
- مع **Coolify**: يتولّى السحب/النشر وبروكسي Traefik والشهادات؛ أضِف نطاقات المشتركين (ومخصّصة) من لوحته.

## 4. النسخ الاحتياطي والاستعادة
- يومي 02:00: `infra/scripts/backup.sh` (pg_dump -Fc → تشفير age → R2 `backups/`).
- اختبار استعادة أسبوعي في قاعدة مؤقّتة: `infra/scripts/restore.sh <ملف.dump.age>` ثم `/health`.
- R2 (الوسائط) مصدر الحقيقة للملفات؛ فعّل الإصدارات.

## 5. المراقبة
- `/api/v1/health` (liveness/readiness)، و`GET /admin/system/status` (DB + صحّة التكاملات).
- سجلّات pino (JSON) مع `correlationId`؛ سجلّ استدعاءات التكاملات في `IntegrationCallLog`.

## 6. التراجع (rollback)
- أعد الوسم السابق للصورة و`docker compose up -d`. هجرات القاعدة: استعِد من آخر نسخة قبل الترقية إن لزم.

## 7. المهام الدورية
- تحرير الحجوزات منتهية المهلة كل 5 دقائق (`JobsService`، مُجدول عبر @nestjs/schedule؛ في التوسّع الأفقي يُنقل إلى عامل BullMQ واحد لتفادي التكرار بين النسخ).
