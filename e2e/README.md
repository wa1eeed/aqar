# اختبارات Playwright الطرفية (الواجهة العامة)

تشغّل الواجهة العامة الثابتة (`frontend/`) عبر مُخدِّم بوكيل `/api` إلى الباكند الحقيقي والقاعدة المبذورة.

## المتطلّبات
- بناء الباكند: `pnpm --filter @manzilah/backend build`
- قاعدة مبذورة: `DATABASE_URL=… pnpm --filter @manzilah/backend db:seed`
- متصفّح Playwright: `pnpm exec playwright install chromium`

## التشغيل
```bash
cd e2e
pnpm exec playwright test        # كل المسارات
pnpm exec playwright test --ui   # واجهة تفاعلية
```
القاعدة الافتراضية: `manzilah_dev` (عدّلها بـ `DATABASE_URL`).

## المسارات
- `browse.spec.ts` — تصفّح العقارات والفلترة حسب العرض.
- `request.spec.ts` — إرسال طلب تواصل (Lead).
- `otp-login.spec.ts` — دخول العميل عبر OTP بالبريد (يقرأ الرمز من سجلّ التطوير).
- `booking.spec.ts` — رحلة الحجز حتى عرض السعر والدفع.
