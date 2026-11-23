# النشر على Coolify

للمنصّة مساران حسب سيرفرك:

- **أ) سيرفر مُخصّص لهذا المشروع** → **Caddy يملك 80/443** (كامل تعدّد المستأجرين: نطاقات فرعية +
  مخصّصة + TLS عند الطلب). الملفّ `infra/docker-compose.yml`. التفاصيل في الأقسام ١–٩ أدناه.
- **ب) سيرفر Coolify مشترك مع مشاريع أخرى** → **بروكسي Coolify (Traefik) يتولّى الدومين وTLS**،
  وCaddy يعمل داخلياً للتوجيه. الملفّ `infra/docker-compose.coolify.yml`. **راجع القسم «ب» في الأسفل**.

> في المسار «ب»: النطاق الأساسي يعمل فوراً عبر Let's Encrypt. النطاقات الفرعية للمكاتب تحتاج شهادة
> wildcard في Coolify (تحدّي DNS عبر Cloudflare)، والنطاقات المخصّصة بـTLS عند الطلب تُؤجَّل حتى سيرفر
> مخصّص بـCaddy. الباكند نفسه يدعم تعدّد المستأجرين كاملاً؛ القيد في طبقة الشهادات فقط.

---

## المسار أ) سيرفر مخصّص — Caddy يملك 80/443

البنية: `infra/docker-compose.yml` — postgres · redis · api · worker · admin-build · caddy.

---

## 1) المتطلّبات (الإعداد الحالي: Oracle Cloud + Cloudflare)
- **خادم Oracle Cloud (OCI) — الطبقة المجانية**: اختر شكل **Ampere A1 (ARM)** — مثلاً **2 OCPU / 12GB**
  (الطبقة المجانية تتيح حتى 4 OCPU/24GB). **لا تستخدم نسخة x86 المصغّرة (1GB ذاكرة)** فهي لا تكفي الحزمة
  (postgres + redis + api + worker + caddy). الصور متعدّدة المعماريات فتعمل على ARM بلا تعديل.
  القرص: 50GB فأكثر (الطبقة المجانية تتيح حتى ~200GB).
- **افتح المنفذين 80 و443** في مكانين على OCI:
  1. **Security List / NSG** للشبكة الفرعية: Ingress لـTCP 80 و443 من `0.0.0.0/0`.
  2. **جدار النسخة الداخلي** (صور أوراكل تحجب بـiptables افتراضياً):
     ```bash
     sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save   # أو: sudo iptables-save | sudo tee /etc/iptables/rules.v4
     ```
- **Coolify مثبّت على نفس الخادم** (`curl -fsSL https://cdn.coolify.io/v4/install.sh | bash`)،
  وبروكسيه **غير مشغّل على 80/443** حتى يبنّدهما Caddy (هذا الخادم مخصّص لهذه الحزمة).
- النطاق **`aqaar.online`** على Cloudflare.

## 2) DNS على Cloudflare (نطاق aqaar.online)
وجّه السجلّات إلى **IP الخادم العام** من OCI، و**اجعلها DNS فقط (سحابة رماديّة)** لا Proxied —
حتى يدير Caddy شهاداته (ACME/on-demand) مباشرةً كما صُمّم:

| النوع | الاسم | المحتوى | Proxy |
|---|---|---|---|
| A | `@` | `‏<IP الخادم>` | DNS only (رمادي) |
| A | `*` | `‏<IP الخادم>` | DNS only (رمادي) |

- `aqaar.online` و`*.aqaar.online` (نطاقات المكاتب الفرعية) تُصدَّر شهاداتها تلقائياً.
- **نطاق مشترك مخصّص** (نطاق المكتب الخاص): يُوجَّه مباشرةً إلى IP الخادم (لا عبر Cloudflare)، وتُصدَّر
  شهادته **عند الطلب** بعد إضافته من لوحة السوبر-أدمن (يتحقّق Caddy من `‎/api/v1/platform/domains/check`).

> لاحقاً يمكن تفعيل بروكسي Cloudflare (السحابة البرتقالية) مع شهادة Origin ووضع SSL=Full(strict)،
> لكن ابدأ **DNS only** — أبسط ومطابق لتصميم TLS متعدّد المستأجرين.

## 3) الأسرار (ولّدها على جهازك)
```bash
openssl rand -hex 32   # APP_ENCRYPTION_KEY
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -base64 18  # SEED_PLATFORM_ADMIN_PASSWORD و SEED_OWNER_PASSWORD
```

## 4) متغيّرات البيئة في Coolify
انسخ مفاتيح `infra/.env.example` إلى متغيّرات البيئة للمورد في Coolify، واملأ:
- **الأساس:** `PLATFORM_BASE_DOMAIN=نطاقك`، `ACME_EMAIL=بريدك`،
  `ONDEMAND_ASK_URL=http://api:3000/api/v1/platform/domains/check`.
- **Postgres:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=manzilah`،
  و`DATABASE_URL=postgresql://<USER>:<PASSWORD>@postgres:5432/manzilah?schema=public`.
- **Redis:** `REDIS_URL=redis://redis:6379`.
- **الأسرار:** `APP_ENCRYPTION_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
- **بذرة أولى:** `SEED_PLATFORM_ADMIN_EMAIL/NAME/PASSWORD`،
  `SEED_TENANT_SLUG=demo`, `SEED_TENANT_CODE=MZ`, `SEED_TENANT_NAME`،
  `SEED_OWNER_EMAIL/NAME/PASSWORD`.
- `NODE_ENV=production`, `PORT=3000`.
- تكاملات المنصّة (R2/Resend) تُترك فارغة هنا وتُدخَل لاحقاً من لوحة السوبر-أدمن (مُشفّرة).

> في الإنتاج يُلزِم `SEED_PLATFORM_ADMIN_PASSWORD` و`SEED_OWNER_PASSWORD` (البذر يرفض كلمات افتراضية).

## 5) المورد في Coolify
1. **New Resource → Docker Compose**، واربطه بمستودع GitHub `wa1eeed/aqar`، الفرع `main`.
2. مسار ملفّ الـcompose: `infra/docker-compose.yml`.
3. ألصق متغيّرات البيئة (الخطوة 4).
4. تأكّد أنّ Coolify **لا** يضيف بروكسيه أمام الخدمات (Caddy يبنّد 80/443 مباشرة).
5. **Deploy** — يبني Coolify الصور (api/worker، admin-build) ويُشغّل الحزمة.
   - الـapi يُهيّئ المخطّط تلقائياً عند الإقلاع (`prisma migrate deploy` وإلا `db push`).

## 6) البذر (مرّة واحدة)
بعد أوّل إقلاع، من طرفية المورد في Coolify (أو عبر SSH في مجلّد الحزمة):
```bash
docker compose run --rm api pnpm db:seed
```
يُنشئ: السوبر-أدمن، الخطط، المدن، والمشترك التجريبي `demo` ببياناته.

## 7) التحقّق
- `curl -fsS https://<نطاقك>/api/v1/health` → `{"status":"ok","db":"up"}`.
- لوحة المكتب: `https://<نطاقك>/admin/` (أو `https://demo.<نطاقك>/admin/`).
- السوبر-أدمن: `https://<نطاقك>/admin/` بحساب `SEED_PLATFORM_ADMIN_EMAIL`.
- من لوحة السوبر-أدمن: أدخل تكاملات **R2** (التخزين) و**Resend** (البريد)، واختبر الاتصال.

## 8) إيصالات PDF (اختياري — عند تفعيل Moyasar)
عامل الإيصالات يعرض HTML→PDF عبر Chromium، غير مثبّت افتراضياً (عزل: الـapi يبقى خفيفاً).
لتفعيلها، أنشئ صورة عامل تُثبّت Chromium واضبط `CHROMIUM_PATH`:
```dockerfile
# backend/Dockerfile.worker (مثال)
FROM manzilah-api  # أو كرّر مرحلة runtime
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
CMD ["node","dist/worker.js"]
```
ثمّ وجّه خدمة `worker` إلى هذا الـDockerfile، واضبط `CHROMIUM_PATH=/usr/bin/chromium`.
بدونها يردّ تنزيل الإيصال «قيد التجهيز» (503) دون أثر على بقيّة المنصّة.

## 9) التشغيل اليومي
- **الترقية:** ادفع إلى `main` → Coolify يُعيد البناء والنشر تلقائياً.
- **النسخ الاحتياطي/الاستعادة/التراجع/المراقبة:** راجع [RUNBOOK](RUNBOOK.md) §4–§6.
- **نطاق مشترك مخصّص:** أضِفه من لوحة السوبر-أدمن، ثمّ وجّه DNS له إلى الخادم — يُصدَّر TLS عند أوّل زيارة.

---

## المسار ب) سيرفر Coolify مشترك — بروكسي Coolify يتولّى TLS (حالتك)

البنية: `infra/docker-compose.coolify.yml` — نفس الخدمات، لكنّ Caddy يعمل داخلياً على :80 (بلا حجز
80/443)، وCoolify يوجّه `aqaar.online` إليه ويُصدِر شهادة Let's Encrypt.

### ب-١) Cloudflare DNS
| النوع | الاسم | المحتوى | Proxy |
|---|---|---|---|
| A | `@` | IP سيرفرك | 🔘 DNS only (رمادي) |

> رمادي (DNS only) ليتحقّق Let's Encrypt (عبر Coolify) من النطاق مباشرةً. النطاقات الفرعية لاحقاً.

### ب-٢) أنشئ المورد في Coolify
1. **New Resource → Docker Compose** → اربط `wa1eeed/aqar` فرع `main`.
2. مسار الـcompose: **`infra/docker-compose.coolify.yml`**.
3. **Environment variables** (نفس القسم ٤ من المسار أ): `PLATFORM_BASE_DOMAIN=aqaar.online`،
   `POSTGRES_*`, `DATABASE_URL=postgresql://<USER>:<PASS>@postgres:5432/<DB>?schema=public`,
   `REDIS_URL=redis://redis:6379`, الأسرار، وبيانات البذر. `NODE_ENV=production`.
   (لا حاجة لـ`ACME_EMAIL`/`ONDEMAND_ASK_URL` هنا — Coolify يتولّى TLS.)

### ب-٣) اربط الدومين بخدمة caddy
- في المورد → خدمة **`caddy`** → **Domains** → أضِف `https://aqaar.online`، والمنفذ **80**.
- Coolify يضيف تسميات Traefik ويُصدِر شهادة Let's Encrypt تلقائياً.

### ب-٤) Deploy
اضغط **Deploy** — يبني Coolify الصور (api/worker، admin-build) ويُشغّل الحزمة خلف بروكسيه.

### ب-٥) البذر والتحقّق
```bash
# من طرفية المورد في Coolify:
docker compose -f infra/docker-compose.coolify.yml run --rm api pnpm db:seed
```
- `https://aqaar.online/api/v1/health` → `{"status":"ok","db":"up"}`.
- اللوحة: `https://aqaar.online/admin/` (سجّل بحساب `SEED_PLATFORM_ADMIN_EMAIL`).
- أدخل تكاملات R2 وResend من لوحة السوبر-أدمن.

### ب-٦) لاحقاً — نطاقات المكاتب الفرعية
- **خيار سريع:** أضِف كلّ نطاق فرعي (`demo.aqaar.online`) يدوياً على خدمة caddy في Coolify.
- **خيار شامل:** فعّل شهادة wildcard `*.aqaar.online` في Coolify عبر تحدّي DNS (توكن Cloudflare API).
- **تعدّد المستأجرين الكامل** (نطاقات مخصّصة + TLS عند الطلب): يأتي مع سيرفر مخصّص بـCaddy (المسار أ).

## بذر بيانات العرض التجريبي (اختياري)
بيانات العرض (عقارات/طلبات/حجوزات للمكتب `demo`) لا تُبذَر في الإنتاج افتراضياً. لتفعيلها مرّة:
```bash
docker exec -e SEED_DEMO=1 $(docker ps --format '{{.Names}}' | grep '^api-' | head -n1) pnpm db:seed
```
(صورة الـAPI تتضمّن `frontend/data` اللازم لذلك.)
