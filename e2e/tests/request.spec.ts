import { test, expect } from '@playwright/test';

// مسار إرسال طلب: نموذج «تواصل معنا» → POST /api/v1/public/leads → تأكيد.
test('إرسال طلب تواصل ينشئ Lead ويُظهر تأكيداً', async ({ page }) => {
  await page.goto('/contact.html');

  const form = page.locator('form[data-contact]');
  await expect(form).toBeVisible();

  await form.locator('input[name="name"]').fill('زائر الاختبار الطرفي');
  await form.locator('input[name="phone"]').fill('0551234567');
  await form.locator('input[name="email"]').fill('e2e.visitor@example.com');

  // المدينة ونوع العقار تُملأ من المخطّط — اختر أوّل قيمة فعلية إن وُجدت
  for (const sel of ['select[name="city"]', 'select[name="type"]']) {
    const el = form.locator(sel);
    const values = await el.locator('option').evaluateAll((os) =>
      (os as HTMLOptionElement[]).map((o) => o.value).filter((v) => v),
    );
    if (values.length) await el.selectOption(values[0]);
  }

  await form.locator('textarea[name="message"]').fill('أرغب بمعاينة عقار مناسب في أقرب وقت. (اختبار طرفي)');
  await form.locator('input[name="consent"]').check();

  // استجابة إنشاء الطلب من الخادم
  const created = page.waitForResponse(
    (r) => r.url().includes('/api/v1/public/leads') && r.request().method() === 'POST',
  );
  await form.locator('button[type="submit"]').click();
  const res = await created;
  expect(res.status()).toBeLessThan(300);

  // رسالة نجاح في الواجهة (شكر/تم الإرسال)
  await expect(page.locator('body')).toContainText(/شكر|تم|استلمنا|سنتواصل|نجاح/i, { timeout: 10_000 });
});
