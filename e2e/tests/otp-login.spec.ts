import { test, expect } from '@playwright/test';
import { loginViaOtp } from '../helpers.js';

// مسار دخول العميل عبر OTP بالبريد.
test('دخول العميل عبر OTP بالبريد', async ({ page }) => {
  const email = `e2e.customer+${Date.now()}@example.com`;
  await page.goto('/index.html');
  await loginViaOtp(page, email);
  // بعد الدخول تظهر قائمة الحساب (حجوزاتي / المفضّلة) بدل زرّ الدخول
  await expect(page.locator('[data-login]')).toHaveCount(0);
});
