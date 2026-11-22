import { defineConfig, devices } from '@playwright/test';

// اختبارات طرفية للواجهة العامة (frontend/) ضدّ الباكند الحقيقي والقاعدة المبذورة.
// القاعدة: DATABASE_URL (الافتراضي قاعدة التطوير المبذورة). شغّل `pnpm db:seed` قبلها.
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://aa@localhost:5432/manzilah_dev?schema=public';

const backendEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL,
  // أسرار اختبار محلّية فقط (ليست أسرار إنتاج).
  APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'e2e-access-secret-0123456789',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret-0123456789',
  PLATFORM_BASE_DOMAIN: 'manzilah.local',
};

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'ar-SA',
    trace: 'retain-on-failure',
    // ترويسة المشترك للواجهة العامة محلياً (في الإنتاج يُحلّ من النطاق).
    extraHTTPHeaders: { 'X-Tenant': 'demo' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // يُسجَّل في ملفّ ليقرأ اختبار OTP الرمز (NODE_ENV=development يطبع الرمز، docs/06).
      command: 'node dist/main.js > ../e2e/.backend.log 2>&1',
      cwd: '../backend',
      url: 'http://localhost:3000/api/v1/health',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: backendEnv,
    },
    {
      command: 'node static-proxy.mjs',
      url: 'http://localhost:4173/index.html',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: { PORT: '4173', API_PORT: '3000' },
    },
  ],
});
