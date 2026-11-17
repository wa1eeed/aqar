import { z } from 'zod';

const base64Key32 = z
  .string()
  .refine(
    (v) => Buffer.from(v, 'base64').length === 32,
    'must be 32 bytes encoded as base64 (openssl rand -base64 32)',
  );

const secret = (name: string) => z.string().min(32, `${name} must be at least 32 characters`);

/**
 * Infrastructure configuration from the environment (docs/10 §1). Validated at boot:
 * the process refuses to start with a missing or weak value.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    PUBLIC_URL: z.string().url().default('http://localhost:8080'),
    /** Number of reverse proxies in front of the API (Caddy = 1, Coolify Traefik + Caddy = 2). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

    DATABASE_URL: z.string().startsWith('postgresql://'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// URL'),

    APP_ENCRYPTION_KEY: base64Key32,
    /** Previous key, only while running `rotate-encryption-key`. */
    APP_ENCRYPTION_KEY_PREVIOUS: base64Key32.optional(),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
    /** Pepper for SHA-256 hashes of national IDs (docs/01 Customer.nationalIdHash). */
    NATIONAL_ID_PEPPER: secret('NATIONAL_ID_PEPPER'),

    // Infrastructure defaults for providers (docs/10 §1); values saved in the admin panel win.
    RESEND_API_KEY: z.string().min(8).optional(),
    R2_ACCOUNT_ID: z
      .string()
      .regex(/^[A-Za-z0-9]{8,64}$/)
      .optional(),
    R2_ACCESS_KEY_ID: z.string().min(8).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(8).optional(),
    R2_UPLOADS_BUCKET: z.string().optional(),
    R2_MEDIA_BUCKET: z.string().optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),

    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'must differ from JWT_ACCESS_SECRET' });
    }
    if (env.NODE_ENV === 'production' && !env.PUBLIC_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['PUBLIC_URL'], message: 'must be https in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Compose passes optional variables as empty strings: treat them as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    // Never print values, only which variables are wrong.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}
