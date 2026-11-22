import { test, expect } from '@playwright/test';
import { loginViaOtp } from '../helpers.js';

// رحلة الحجز: دخول → صفحة عقار → «احجز العقار» → عرض السعر (عربون/كامل + المستحق).
// نتوقّف عند حدود مزوّد الدفع (Moyasar)، فنتحقّق من عرض الحجز لا من إتمام الدفع.
test('رحلة الحجز حتى عرض السعر والدفع', async ({ page }) => {
  const email = `e2e.booker+${Date.now()}@example.com`;
  await page.goto('/index.html');
  await loginViaOtp(page, email);

  // ابحث عن أوّل عقار متاح يقبل الحجز (زرّ «احجز العقار»)
  await page.goto('/properties.html');
  const firstCard = page.locator('article.card[data-id]').first();
  await expect(firstCard).toBeVisible();

  // افتح عقاراً حتى نجد زرّ «احجز العقار»
  const ids = await page.locator('article.card[data-id]').evaluateAll((els) =>
    (els as HTMLElement[]).slice(0, 8).map((e) => e.getAttribute('data-id')!),
  );
  let booked = false;
  for (const id of ids) {
    await page.goto(`/property.html#p-${id}`);
    const cta = page.locator('a.btn[href*="/booking.html#p-"]', { hasText: 'احجز العقار' });
    if (await cta.count()) {
      await cta.first().click();
      booked = true;
      break;
    }
  }
  expect(booked, 'يوجد عقار واحد على الأقل قابل للحجز').toBeTruthy();

  // صفحة الحجز: يُعرض السعر (عربون + المستحق الآن) وطريقة دفع وزرّ التأكيد
  await expect(page).toHaveURL(/\/booking\.html#p-/);
  const booking = page.locator('[data-booking]');
  await expect(booking).toContainText('عربون', { timeout: 15_000 });
  await expect(booking).toContainText('المستحق الآن');
  await expect(booking.locator('input[name="pt"][value="deposit"]')).toBeVisible();
  await expect(booking.locator('[data-confirm]')).toBeVisible();
});
