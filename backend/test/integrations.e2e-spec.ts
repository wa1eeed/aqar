import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import nock from 'nock';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { EmailService, type EmailJob } from '../src/modules/email/email.service';
import { IntegrationsGateway } from '../src/modules/integrations/gateway.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_QUEUE } from '../src/queue/queue.module';
import { REDIS } from '../src/redis/redis.module';
import { createStaff, freshIp, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

const RESEND = 'https://api.resend.com';
const OVERPASS = 'https://overpass-api.de';
const KEY_A = 're_test_key_AAAA1111';
const KEY_B = 're_test_key_BBBB2222';
const WEBHOOK_SECRET = `whsec_${Buffer.from('resend-webhook-signing-secret-0123').toString('base64')}`;

describe('Integrations gateway (e2e, docs/05)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let token = '';

  const as = (method: 'get' | 'put' | 'post', path: string) =>
    http[method](`/api/v1${path}`).set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${token}`);

  /** Runs queued email jobs in-process (what the worker does). */
  async function drainEmails(): Promise<void> {
    const queue = app.get<Queue<EmailJob>>(EMAIL_QUEUE);
    const email = app.get(EmailService);
    for (const job of await queue.getJobs(['waiting', 'delayed', 'prioritized'])) {
      await email.deliver(job.data, 1, 5);
      await job.remove();
    }
  }

  beforeAll(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
    await prisma.$transaction([
      prisma.integrationCallLog.deleteMany(),
      prisma.integration.deleteMany(),
      prisma.webhookEvent.deleteMany(),
      prisma.nearbyCache.deleteMany(),
    ]);
    await app.get<Queue>(EMAIL_QUEUE).obliterate({ force: true });

    // A custom role with only integrations.manage (custom roles do not force 2FA, keeps the test short).
    const role = await prisma.role.create({
      data: {
        key: 'custom_integrator',
        nameAr: 'مسؤول التكاملات',
        isSystem: false,
        permissions: ['integrations.manage'],
      },
    });
    await createStaff(app, 'agent', 'agent@nx.test', 'Agent-Password-2026');
    const s = await createStaff(app, 'agent', 'integrator@nx.test', 'Integrator-Pass-2026');
    await prisma.staffUser.update({ where: { id: s.id }, data: { roleId: role.id } });
    token = (
      await http
        .post('/api/v1/auth/staff/login')
        .set('X-Forwarded-For', freshIp())
        .send({ email: 'integrator@nx.test', password: 'Integrator-Pass-2026' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await app.close();
  });

  afterEach(() => nock.cleanAll());

  it('lists every integration grouped data; agents are refused', async () => {
    const res = await as('get', '/admin/integrations').expect(200);
    expect(res.body.items).toHaveLength(15);
    expect(res.body.items.find((i: { key: string }) => i.key === 'maps.osm')).toMatchObject({
      enabled: true,
      prepared: false,
    });
    expect(res.body.items.find((i: { key: string }) => i.key === 'gov.rega')).toMatchObject({
      enabled: false,
      prepared: true,
    });
    const agent = (
      await http
        .post('/api/v1/auth/staff/login')
        .set('X-Forwarded-For', freshIp())
        .send({ email: 'agent@nx.test', password: 'Agent-Password-2026' })
    ).body.accessToken;
    await http.get('/api/v1/admin/integrations').set('Authorization', `Bearer ${agent}`).expect(403);
  });

  describe('acceptance: changing the Resend API key takes effect without restart', () => {
    it('configures, enables and sends with key A, then key B', async () => {
      await as('put', '/admin/integrations/email.resend')
        .send({
          config: { fromName: 'منزلة العقارية', fromEmail: 'no-reply@example.sa', domain: 'example.sa' },
          secrets: { apiKey: KEY_A, webhookSigningSecret: WEBHOOK_SECRET },
        })
        .expect(200);
      await as('post', '/admin/integrations/email.resend/enable').expect(204);

      const first = nock(RESEND, { reqheaders: { authorization: `Bearer ${KEY_A}` } })
        .post('/emails', (b) => b.to[0] === 'agent@nx.test' && b.from === '"منزلة العقارية" <no-reply@example.sa>')
        .matchHeader('idempotency-key', /^email:/)
        .reply(200, { id: 'em_first' });
      await http
        .post('/api/v1/auth/staff/password/forgot')
        .set('X-Forwarded-For', freshIp())
        .send({ email: 'agent@nx.test' })
        .expect(204);
      await drainEmails();
      expect(first.isDone()).toBe(true);
      expect(await prisma.emailLog.findFirst({ where: { resendId: 'em_first' } })).toMatchObject({
        status: 'sent',
        template: 'password-reset',
      });

      await as('put', '/admin/integrations/email.resend')
        .send({ secrets: { apiKey: KEY_B } })
        .expect(200);
      const second = nock(RESEND, { reqheaders: { authorization: `Bearer ${KEY_B}` } })
        .post('/emails')
        .reply(200, { id: 'em_second' });
      await http
        .post('/api/v1/auth/staff/password/forgot')
        .set('X-Forwarded-For', freshIp())
        .send({ email: 'agent@nx.test' })
        .expect(204);
      await drainEmails();
      expect(second.isDone()).toBe(true);
    });

    it('a rejected request (4xx) is marked failed and not retried', async () => {
      nock(RESEND).post('/emails').reply(422, { message: 'invalid from' });
      await http
        .post('/api/v1/auth/staff/password/forgot')
        .set('X-Forwarded-For', freshIp())
        .send({ email: 'agent@nx.test' })
        .expect(204);
      await drainEmails();
      const log = await prisma.emailLog.findFirst({
        where: { template: 'password-reset' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toMatchObject({ status: 'failed', error: 'INTEGRATION_HTTP_ERROR (422)' });
    });
  });

  describe('acceptance: secrets never appear in API responses or logs', () => {
    it('admin view shows hints only', async () => {
      const res = await as('get', '/admin/integrations/email.resend').expect(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(KEY_A);
      expect(raw).not.toContain(KEY_B);
      expect(raw).not.toContain('resend-webhook-signing-secret');
      expect(res.body.secrets.apiKey).toEqual({ set: true, hint: '••••2222' });
      expect(res.body.form.secrets.map((f: { key: string }) => f.key)).toEqual(['apiKey', 'webhookSigningSecret']);
      expect(res.body.webhookUrl).toBe('http://localhost:8080/api/v1/webhooks/resend');
    });

    it('call logs, audit log and stored row hold no secret values', async () => {
      const logs = await prisma.integrationCallLog.findMany({ where: { integrationKey: 'email.resend' } });
      expect(logs.length).toBeGreaterThanOrEqual(3);
      const audit = await prisma.auditLog.findMany({ where: { entityType: 'integration' } });
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining(['integration.secrets.update', 'integration.config.update', 'integration.enable']),
      );
      const row = await prisma.integration.findUniqueOrThrow({ where: { key: 'email.resend' } });
      for (const blob of [
        JSON.stringify(logs),
        JSON.stringify(audit),
        JSON.stringify(row.config),
        JSON.stringify(row.secretsHint),
        row.secretsEnc!.toString('latin1'),
      ]) {
        expect(blob).not.toContain(KEY_A);
        expect(blob).not.toContain(KEY_B);
        expect(blob.toLowerCase()).not.toContain('bearer');
      }
    });

    it('API logs endpoint returns redacted entries', async () => {
      const res = await as('get', '/admin/integrations/email.resend/logs').expect(200);
      expect(res.body.items[0]).toMatchObject({ operation: 'sendEmail', correlationId: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/re_test_key/);
    });

    it('saving secrets requires a recent password/TOTP check', async () => {
      const redis = app.get<Redis>(REDIS);
      const me = await as('get', '/auth/me').expect(200);
      const fam = (
        await prisma.refreshToken.findFirstOrThrow({
          where: { subjectId: me.body.staff.id },
          orderBy: { createdAt: 'desc' },
        })
      ).family;
      await redis.set(`auth:authtime:${fam}`, String(Math.floor(Date.now() / 1000) - 3600));
      const login = await http
        .post('/api/v1/auth/staff/login')
        .set('X-Forwarded-For', freshIp())
        .send({ email: 'integrator@nx.test', password: 'Integrator-Pass-2026' });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('nx_srt='))!
        .split(';')[0]!;
      const loginFam = (
        await prisma.refreshToken.findFirstOrThrow({
          where: { subjectId: me.body.staff.id },
          orderBy: { createdAt: 'desc' },
        })
      ).family;
      await redis.set(`auth:authtime:${loginFam}`, String(Math.floor(Date.now() / 1000) - 3600));
      const stale = await http
        .post('/api/v1/auth/refresh')
        .set('X-Requested-With', 'nx')
        .set('Cookie', cookie)
        .send({ audience: 'staff' })
        .expect(200);
      const res = await http
        .put('/api/v1/admin/integrations/email.resend')
        .set('Authorization', `Bearer ${stale.body.accessToken}`)
        .send({ secrets: { apiKey: 're_test_key_CCCC3333' } })
        .expect(401);
      expect(res.body.error.code).toBe('REAUTH_REQUIRED');
      // Non-secret config can still be edited.
      await http
        .put('/api/v1/admin/integrations/email.resend')
        .set('Authorization', `Bearer ${stale.body.accessToken}`)
        .send({ config: { replyTo: 'info@example.sa' } })
        .expect(200);
    });
  });

  describe('acceptance: nearby is served from cache on the second call', () => {
    let propertyId = 0;

    beforeAll(async () => {
      await prisma.city.upsert({
        where: { id: 'riyadh' },
        create: { id: 'riyadh', nameAr: 'الرياض', lat: 24.7136, lng: 46.6753 },
        update: {},
      });
      const district = await prisma.district.upsert({
        where: { cityId_nameAr: { cityId: 'riyadh', nameAr: 'الملقا' } },
        create: { cityId: 'riyadh', nameAr: 'الملقا' },
        update: {},
      });
      const agent = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'agent@nx.test' } });
      await prisma.property.deleteMany();
      const p = await prisma.property.create({
        data: {
          code: 'MZ-TMP',
          slug: 'فيلا',
          type: 'villa',
          offer: 'sale',
          visibility: 'published',
          title: 'فيلا تجريبية',
          description: 'وصف',
          cityId: 'riyadh',
          districtId: district.id,
          lat: 24.8,
          lng: 46.61,
          price: 100_000_000n,
          annualisedPrice: 100_000_000n,
          area: 400,
          specs: {},
          adLicenseNo: '7100000001',
          falLicenseNo: '1100000000',
          agentId: agent.id,
          createdById: agent.id,
        },
      });
      propertyId = p.id;
      expect(propertyId).toBeGreaterThanOrEqual(1001);
    });

    it('first call → Overpass; second call → cache (no HTTP); the DB cache survives a Redis flush', async () => {
      const scope = nock(OVERPASS)
        .post('/api/interpreter', (body) => (typeof body === 'string' ? body.startsWith('data=') : true))
        .reply(200, {
          elements: [{ type: 'node', id: 7, lat: 24.801, lon: 46.611, tags: { amenity: 'fuel', name: 'محطة' } }],
        });

      const first = await http.get(`/api/v1/public/properties/${propertyId}/nearby`).expect(200);
      expect(first.body).toEqual({
        source: 'places.overpass',
        items: [expect.objectContaining({ cat: 'fuel', name: 'محطة', distance: expect.any(Number) })],
      });
      expect(scope.isDone()).toBe(true);

      // No interceptor left and the network is disabled: any provider call would fail.
      const second = await http.get(`/api/v1/public/properties/${propertyId}/nearby`).expect(200);
      expect(second.body).toEqual(first.body);
      const redis = app.get<Redis>(REDIS);
      await redis.del(...(await redis.keys('nearby:*')));
      const third = await http.get(`/api/v1/public/properties/${propertyId}/nearby`).expect(200);
      expect(third.body).toEqual(first.body);
      expect(
        await prisma.integrationCallLog.count({ where: { integrationKey: 'places.overpass', operation: 'nearby' } }),
      ).toBe(1);
      expect(await prisma.nearbyCache.count({ where: { propertyId } })).toBe(1);
    });

    it('unpublished or unknown properties → 404', async () => {
      await http.get('/api/v1/public/properties/999999/nearby').expect(404);
      await http.get('/api/v1/public/properties/99999999999/nearby').expect(404);
    });
  });

  describe('resilience', () => {
    it('retries idempotent calls on 5xx and logs every attempt', async () => {
      await prisma.integrationCallLog.deleteMany({ where: { integrationKey: 'places.overpass' } });
      nock(OVERPASS).post('/api/interpreter').reply(503, 'busy').post('/api/interpreter').reply(200, { elements: [] });
      const gw = app.get(IntegrationsGateway);
      const res = await gw.places().nearby(24.7, 46.6, 500, ['fuel']);
      expect(res).toEqual({ source: 'places.overpass', items: [] });
      const logs = await prisma.integrationCallLog.findMany({
        where: { integrationKey: 'places.overpass' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => [l.success, l.httpStatus])).toEqual([
        [false, 503],
        [true, 200],
      ]);
    });

    it('opens the circuit after 5 consecutive failures, marks health down and stops calling', async () => {
      const gw = app.get(IntegrationsGateway);
      nock(OVERPASS).post('/api/interpreter').times(15).reply(500, 'down');
      for (let i = 0; i < 5; i++) {
        const r = await gw.places().nearby(24.7, 46.6, 500, ['fuel']);
        expect(r.source).toBe('none'); // falls back to an empty list, page still renders
      }
      const row = await prisma.integration.findUniqueOrThrow({ where: { key: 'places.overpass' } });
      expect(row.health).toBe('down');
      const before = await prisma.integrationCallLog.count({ where: { integrationKey: 'places.overpass' } });
      await gw.places().nearby(24.7, 46.6, 500, ['fuel']);
      expect(await prisma.integrationCallLog.count({ where: { integrationKey: 'places.overpass' } })).toBe(before);
      await app.get<Redis>(REDIS).del('int:breaker:places.overpass');
    }, 30_000);

    it('refuses provider URLs that point inside the network (SSRF)', async () => {
      await as('put', '/admin/integrations/places.overpass')
        .send({ config: { endpoint: 'https://169.254.169.254/latest' } })
        .expect(200);
      const res = await as('post', '/admin/integrations/places.overpass/test').expect(200);
      expect(res.body.ok).toBe(false);
      await as('put', '/admin/integrations/places.overpass')
        .send({ config: { endpoint: 'https://overpass-api.de/api/interpreter' } })
        .expect(200);
    });
  });

  describe('admin rules', () => {
    it('prepared integrations cannot be enabled and say why', async () => {
      const en = await as('post', '/admin/integrations/gov.rega/enable').expect(422);
      expect(en.body.error.code).toBe('PROVIDER_NOT_READY');
      const t = await as('post', '/admin/integrations/gov.rega/test').expect(200);
      expect(t.body).toMatchObject({ ok: false, messageAr: 'بانتظار بيانات الربط من الجهة المزوّدة' });
    });

    it('validates config and secrets against the provider schemas', async () => {
      const bad = await as('put', '/admin/integrations/payments.moyasar')
        .send({ secrets: { secretKey: 'pk_live_wrong_kind_key' } })
        .expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      await as('put', '/admin/integrations/payments.moyasar')
        .send({ config: { mode: 'popup' } })
        .expect(400);
      await as('get', '/admin/integrations/nope.key').expect(404);
    });

    it('switching to live needs explicit confirmation; test uses the matching key', async () => {
      await as('put', '/admin/integrations/payments.moyasar')
        .send({ secrets: { secretKey: 'sk_test_abcdef123456' } })
        .expect(200);
      const noConfirm = await as('put', '/admin/integrations/payments.moyasar')
        .send({ environment: 'live' })
        .expect(422);
      expect(noConfirm.body.error.code).toBe('CONFIRM_LIVE_REQUIRED');
      nock('https://api.moyasar.com')
        .get('/v1/payments')
        .query({ page: '1' })
        .basicAuth({ user: 'sk_test_abcdef123456', pass: '' })
        .reply(200, { payments: [] });
      const ok = await as('post', '/admin/integrations/payments.moyasar/test').expect(200);
      expect(ok.body.ok).toBe(true);
      await as('put', '/admin/integrations/payments.moyasar')
        .send({ environment: 'live', confirmLive: true })
        .expect(200);
      const mismatch = await as('post', '/admin/integrations/payments.moyasar/test').expect(200);
      expect(mismatch.body).toMatchObject({ ok: false, messageAr: expect.stringContaining('sk_live_') });
    });

    it('storage presigns uploads bound to type and size, offline', async () => {
      await as('put', '/admin/integrations/storage.r2')
        .send({
          config: { accountId: 'abc123def456', publicBaseUrl: 'https://cdn.example.sa' },
          secrets: { accessKeyId: 'AKIAEXAMPLE0001', secretAccessKey: 'secret-access-key-example-0001' },
        })
        .expect(200);
      await as('post', '/admin/integrations/storage.r2/enable').expect(204);
      const gw = app.get(IntegrationsGateway);
      const p = await gw.storage().presignPut('uploads', 'transfers/p1/receipt.pdf', 'application/pdf', 1024);
      expect(p.url).toMatch(
        /^https:\/\/abc123def456\.r2\.cloudflarestorage\.com\/uploads\/transfers\/p1\/receipt\.pdf\?/,
      );
      expect(p.url).toContain('X-Amz-Signature=');
      expect(p.url).toMatch(/X-Amz-SignedHeaders=[^&]*content-length/);
      expect(p.url).not.toMatch(/x-amz-checksum|x-amz-sdk-checksum/i);
      expect(p.url).not.toContain('secret-access-key');
      await expect(gw.storage().presignPut('uploads', '../etc/passwd', 'text/plain', 10)).rejects.toThrow();
      expect(await gw.storage().publicUrl('1001/a-card.webp')).toBe('https://cdn.example.sa/1001/a-card.webp');
    });
  });

  describe('Resend webhook', () => {
    const sign = (id: string, ts: string, body: string) =>
      `v1,${createHmac('sha256', Buffer.from(WEBHOOK_SECRET.slice(6), 'base64'))
        .update(`${id}.${ts}.${body}`)
        .digest('base64')}`;

    it('verifies the signature, updates the email status once, rejects forgeries', async () => {
      const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em_first' } });
      const ts = String(Math.floor(Date.now() / 1000));
      const send = (sig: string, id = 'msg_1') =>
        http
          .post('/api/v1/webhooks/resend')
          .set('Content-Type', 'application/json')
          .set('svix-id', id)
          .set('svix-timestamp', ts)
          .set('svix-signature', sig)
          .send(body);

      await send('v1,Zm9yZ2Vk').expect(401);
      expect(await prisma.webhookEvent.count()).toBe(0);
      const ok = await send(sign('msg_1', ts, body)).expect(200);
      expect(ok.body).toEqual({ received: true });
      expect(await prisma.emailLog.findFirst({ where: { resendId: 'em_first' } })).toMatchObject({
        status: 'delivered',
      });
      const dup = await send(sign('msg_1', ts, body)).expect(200);
      expect(dup.body).toEqual({ received: true, duplicate: true });
      expect(await prisma.webhookEvent.count({ where: { provider: 'resend' } })).toBe(1);
    });
  });
});
