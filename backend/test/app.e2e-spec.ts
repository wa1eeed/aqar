import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import request from 'supertest';
import { REDIS } from '../src/redis/redis.module';
import { createTestApp } from './helpers';

describe('HTTP foundation (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.get<Redis>(REDIS).flushdb();
    http = request(app.getHttpServer());
  });
  afterAll(() => app.close());

  describe('health', () => {
    it('GET /api/v1/health reports db + redis without leaking internals', async () => {
      const res = await http.get('/api/v1/health').expect(200);
      expect(res.body).toEqual({
        status: 'ok',
        checks: { db: 'ok', redis: 'ok', queueLag: 0 },
        uptimeSec: expect.any(Number),
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('GET /api/v1/ready', async () => {
      await http.get('/api/v1/ready').expect(200, { ready: true });
    });
  });

  describe('correlation ids', () => {
    it('returns a generated id', async () => {
      const res = await http.get('/api/v1/health');
      expect(res.headers['x-correlation-id']).toMatch(/^c_[0-9a-f]{20}$/);
    });
    it('keeps a safe upstream id and replaces an unsafe one', async () => {
      const ok = await http.get('/api/v1/health').set('X-Correlation-Id', 'upstream_12345');
      expect(ok.headers['x-correlation-id']).toBe('upstream_12345');
      const bad = await http.get('/api/v1/health').set('X-Correlation-Id', '<script>alert(1)</script>');
      expect(bad.headers['x-correlation-id']).toMatch(/^c_/);
    });
  });

  describe('security headers', () => {
    it('sets strict headers and hides the framework', async () => {
      const res = await http.get('/api/v1/health');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('error shape (docs/02 §1)', () => {
    it('unknown route → 404 with code, Arabic message and correlation id', async () => {
      const res = await http.get('/api/v1/does-not-exist').expect(404);
      expect(res.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String),
          details: {},
          correlationId: res.headers['x-correlation-id'],
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('does-not-exist');
    });

    it('unexpected errors → 500 without internals', async () => {
      const res = await http.get('/api/v1/test/boom').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/StaffUser|hunter2|stack|does not exist/);
    });

    it('malformed JSON → 400 without echoing the parser message', async () => {
      const res = await http
        .post('/api/v1/test/echo')
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(JSON.stringify(res.body)).not.toMatch(/JSON|Unexpected/);
    });

    it('oversized body → 413', async () => {
      const res = await http
        .post('/api/v1/test/echo')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ name: 'x'.repeat(1_100_000) }))
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('huge arrays or deep nesting → 413 before validation runs', async () => {
      const res = await http
        .post('/api/v1/test/echo')
        .send({ name: Array(5000).fill('x') })
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_COMPLEX');
    });

    it('validation → 400 VALIDATION_FAILED with fields; unknown keys rejected', async () => {
      const res = await http.post('/api/v1/test/echo').send({ name: 'a', phone: '123', isAdmin: true }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(['name', 'phone']));
    });

    it('valid body passes and bigint serialises as number', async () => {
      const res = await http.post('/api/v1/test/echo').send({ name: 'وليد', phone: '0500000000' }).expect(201);
      expect(res.body).toEqual({ ok: true, body: { name: 'وليد', phone: '0500000000' }, amount: 123 });
    });
  });

  describe('access control', () => {
    it('routes are denied by default unless @Public', async () => {
      const res = await http.get('/api/v1/test/private').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });

    it('CSRF header is required where declared', async () => {
      await http.post('/api/v1/test/csrf').expect(403);
      await http.post('/api/v1/test/csrf').set('X-Requested-With', 'nx').expect(201);
    });
  });

  describe('rate limits', () => {
    it('limits per IP with 429, Retry-After and the error shape', async () => {
      for (let i = 0; i < 3; i++) await http.get('/api/v1/test/limited').expect(200);
      const res = await http.get('/api/v1/test/limited').expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      // Another client (different forwarded IP via the trusted proxy) is unaffected.
      await http.get('/api/v1/test/limited').set('X-Forwarded-For', '203.0.113.9').expect(200);
    });

    it('limits per body field (e.g. OTP destination), case-insensitive', async () => {
      await http.post('/api/v1/test/otp').send({ destination: 'A@x.sa' }).expect(201);
      await http.post('/api/v1/test/otp').send({ destination: 'a@x.sa' }).expect(201);
      await http.post('/api/v1/test/otp').send({ destination: 'a@X.sa' }).expect(429);
      await http.post('/api/v1/test/otp').send({ destination: 'b@x.sa' }).expect(201);
    });
  });
});
