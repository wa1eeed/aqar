import { z } from 'zod';

/** مخطّط متغيّرات البيئة. يُستخدم عبر @nestjs/config validate. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  // مفتاح تشفير أسرار التكاملات (AES-256-GCM): 32 بايت (hex 64 / base64) أو أي نص يُشتق منه المفتاح.
  APP_ENCRYPTION_KEY: z.string().min(16),
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  JWT_REFRESH_SECRET: z.string().min(16).optional(),
  PUBLIC_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`خطأ في متغيّرات البيئة — ${issues}`);
  }
  return parsed.data;
}
