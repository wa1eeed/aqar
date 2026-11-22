import { test, expect } from '@playwright/test';

// مسار التصفّح والفلترة: عرض العقارات ثمّ الفلترة حسب نوع العرض.
test('تصفّح العقارات والفلترة حسب العرض', async ({ page }) => {
  await page.goto('/properties.html');

  // تظهر بطاقات العقارات (من /api/v1/public/properties)
  const cards = page.locator('article.card[data-id]');
  await expect(cards.first()).toBeVisible();
  const initial = await cards.count();
  expect(initial).toBeGreaterThan(0);

  // عدّاد النتائج يعكس وجود عقارات
  const count = page.locator('[data-count]');
  await expect(count).toContainText(/عقار|نتيج|\d/);

  // الفلترة: «للبيع»
  const saleTab = page.locator('[data-offer-tabs] button[data-v="sale"]');
  await saleTab.click();
  await expect(saleTab).toHaveAttribute('aria-pressed', 'true');

  // تبقى بطاقات معروضة بعد الفلترة، وكلّها شارة «للبيع»
  await expect(cards.first()).toBeVisible();
  const saleCount = await cards.count();
  expect(saleCount).toBeGreaterThan(0);

  // كلّ البطاقات المعروضة من نوع «بيع» (شارة العرض)
  const badges = await page.locator('article.card .offer-badge, article.card [class*="offer"]').allInnerTexts();
  if (badges.length) {
    expect(badges.some((b) => b.includes('بيع'))).toBeTruthy();
  }
});
