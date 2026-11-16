import { randomBytes } from 'node:crypto';

// Tests never touch the development database. CI provides TEST_DATABASE_URL / TEST_REDIS_URL.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://nx:nx_dev_password@localhost:5432/nx_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
process.env.PUBLIC_URL = 'http://localhost:8080';
process.env.TRUST_PROXY_HOPS = '1';
process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64');
process.env.JWT_REFRESH_SECRET ??= randomBytes(48).toString('base64');
process.env.NATIONAL_ID_PEPPER ??= randomBytes(48).toString('base64');
