import { randomBytes } from 'node:crypto';
import { loadEnv } from './env';

const valid = () => ({
  NODE_ENV: 'production',
  PUBLIC_URL: 'https://example.sa',
  DATABASE_URL: 'postgresql://u:p@db:5432/nx',
  REDIS_URL: 'redis://redis:6379',
  APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  NATIONAL_ID_PEPPER: 'c'.repeat(40),
});

describe('loadEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(loadEnv(valid()).PORT).toBe(3000);
  });

  it('refuses weak or unsafe configuration without echoing values', () => {
    const cases: Array<Record<string, string>> = [
      { APP_ENCRYPTION_KEY: randomBytes(16).toString('base64') },
      { JWT_ACCESS_SECRET: 'short' },
      { JWT_REFRESH_SECRET: 'a'.repeat(40) },
      { PUBLIC_URL: 'http://example.sa' },
    ];
    for (const override of cases) {
      const env = { ...valid(), ...override };
      expect(() => loadEnv(env)).toThrow(/Invalid environment configuration/);
      try {
        loadEnv(env);
      } catch (e) {
        expect(String(e)).not.toContain(env.JWT_ACCESS_SECRET);
      }
    }
  });
});
