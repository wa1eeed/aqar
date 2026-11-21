# 14 — النشر والتوسّع (Deployment & Scalability)

## 1. قاعدة البيانات — PostgreSQL

المنصة على **PostgreSQL 16** (Prisma provider `postgresql`). سحابياً تُستخدم خدمة مُدارة:
AWS RDS / Aurora، Google Cloud SQL، أو Alibaba ApsaraDB for PostgreSQL. لا تغيير في الكود —
فقط `DATABASE_URL`. امتدادات مطلوبة: `pg_trgm`, `unaccent` (متوفّرة في كل الخدمات المُدارة).

## 2. النشر عبر Coolify (الحالي، VPS)

- Coolify ينشر عبر `infra/docker-compose.yml` أو Dockerfile. عرّف الخدمات واترك Coolify يدير البيئة.
- **البروكسي/TLS:** لـ Coolify بروكسي خاص (Traefik) يدير الشهادات والنطاقات. لذلك:
  - إمّا **تستغني عن خدمة `caddy`** وتكشف منفذ `api` (3000) + تخدم `frontend`/`admin` الثابتة عبر
    Coolify، وتضيف النطاقات (بما فيها **النطاقات المخصّصة للمشتركين**) من لوحة Coolify.
  - أو تُبقي Caddy خلف Traefik (غير مُستحسَن — طبقتا بروكسي).
  - للنطاقات المخصّصة التلقائية: Traefik + Let's Encrypt عبر Coolify يغطّيها عند إضافتها، بدل
    `on_demand_tls` في Caddy.
- PostgreSQL/Redis: إمّا كخدمات Coolify أو مُدارة خارجياً.

## 3. التصميم قابل للتوسّع أفقياً وغير مرتبط بمزوّد

البنية مُصمّمة للانتقال لاحقاً إلى AWS / Google Cloud / Alibaba والتوسّع الأفقي:

| المكوّن | الحالة | التوسّع |
|---|---|---|
| **API (NestJS)** | عديم الحالة (stateless)؛ سياق المشترك عبر AsyncLocalStorage لكل طلب | عدّة نسخ خلف موازِن تحميل (ECS/EKS، GKE/Cloud Run، ACK) |
| **Worker (BullMQ)** | منفصل عن الـ API (نفس الصورة) | نسخ مستقلّة حسب الحِمل |
| **PostgreSQL** | مُدار | رأسي + قارئات (read replicas) للقراءة الثقيلة |
| **Redis** | كاش/طوابير/مُحوّل Socket.IO | مُدار (ElastiCache / Memorystore)؛ عنقود عند الحاجة |
| **التخزين** | Cloudflare R2 (متوافق S3) | محمول إلى S3 / GCS / OSS بتغيير إعداد التكامل فقط؛ لا تخزين محلّي على الخوادم |
| **الصور** | مجلد لكل مشترك `tenants/{tenantId}/…` | CDN أمام دلو الوسائط العام |

### عناصر "متعدّد النسخ" المتبقّية (للتوسّع الأفقي الكامل)
هذه تعمل حالياً لنسخة واحدة؛ تُفعَّل عند تشغيل عدّة نسخ:
- **إبطال كاش إعدادات التكاملات عبر Redis pub/sub** (حالياً داخل العملية + TTL 60ث — متّسق خلال 60ث
  بين النسخ؛ docs/05 §2).
- **مُحوّل Socket.IO على Redis** (`@socket.io/redis-adapter`) لبثّ الأحداث عبر النسخ (docs/00).
- **تحديد المعدّل (rate limiting) و idempotency على Redis** (نافذة منزلقة) بدل الذاكرة.
- رموز الجلسات/التحديث مخزّنة في قاعدة البيانات (تعمل متعدّد النسخ أصلاً).
- لا حاجة إلى جلسات لاصقة (sticky sessions) — الـ API عديم الحالة + مُحوّل Redis.

### قابلية النقل بين السحابات
- حاويات Docker قياسية → أي منصّة حاويات.
- لا اعتماد على خدمة مزوّد بعينها في الكود؛ كل اتصال خارجي عبر `IntegrationsGateway` (docs/05)،
  فتبديل R2→S3 أو Resend→SES مسألة إعداد تكامل، لا كود.
