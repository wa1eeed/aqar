import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// __dirname = مجلّد e2e (الملفّات تُترجَم CommonJS؛ جذر المستودع بلا type:module).
const LOG = join(__dirname, '.backend.log');

/** يقرأ رمز OTP من سجلّ الباكند (NODE_ENV=development يطبع: OTP(login) <email> = <code>). */
export async function readOtp(email: string): Promise<string> {
  const re = new RegExp(`OTP\\([a-z]+\\)\\s+${email.replace(/[.+]/g, '\\$&')}\\s*=\\s*(\\d{6})`, 'g');
  for (let i = 0; i < 30; i++) {
    try {
      const matches = [...(await readFile(LOG, 'utf8')).matchAll(re)];
      if (matches.length) return matches[matches.length - 1]![1]!;
    } catch {
      /* السجلّ غير جاهز بعد */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`لم يظهر رمز OTP لـ ${email}`);
}

/** يسجّل دخول عميل عبر نافذة OTP بالبريد، ويؤكّد نجاح الدخول (يدعم العميل الجديد بخطوة الاسم). */
export async function loginViaOtp(page: Page, email: string, name = 'عميل الاختبار'): Promise<void> {
  await page.locator('[data-login]').first().click();

  const sendForm = page.locator('form[data-otp-send]');
  await expect(sendForm).toBeVisible();
  await sendForm.locator('input[name="email"]').fill(email);
  const sent = page.waitForResponse((r) => r.url().includes('/auth/customer/otp/send'));
  await sendForm.locator('button[type="submit"]').click();
  expect((await sent).status()).toBeLessThan(300);

  const code = await readOtp(email);
  const verifyForm = page.locator('form[data-otp-verify]');
  await expect(verifyForm).toBeVisible();
  await verifyForm.locator('input[name="code"]').fill(code);
  await verifyForm.locator('button[type="submit"]').click();

  // عميل جديد: تعيد الواجهة رسم النموذج بحقل الاسم والموافقة؛ أعِد إدخال الرمز والاسم.
  const nameField = page.locator('form[data-otp-verify] input[name="name"]');
  const isNew = await nameField
    .waitFor({ state: 'visible', timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  if (isNew) {
    await page.locator('form[data-otp-verify] input[name="code"]').fill(code);
    await nameField.fill(name);
    const consent = page.locator('form[data-otp-verify] input[name="consent"]');
    if (await consent.count()) await consent.check();
    await page.locator('form[data-otp-verify] button[type="submit"]').click();
  }

  await expect(page.locator('[data-login]')).toHaveCount(0, { timeout: 10_000 });
}
