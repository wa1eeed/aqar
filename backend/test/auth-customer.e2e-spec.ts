import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import request from 'supertest';
import { REDIS } from '../src/redis/redis.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cookieFrom, freshIp, lastEmail, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

const CSRF = { 'X-Requested-With': 'nx' };

describe('Customer OTP authentication (e2e, docs/03 §2)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;

  const post = (path: string, ip = freshIp()) => http.post(`/api/v1${path}`).set('X-Forwarded-For', ip);
  const codeFor = (to: string) => /(\d{6})/.exec(lastEmail(app, to)!.text)![1]!;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
  });
  afterAll(() => app.close());

  // Each test starts with empty rate-limit counters (the limits themselves are tested explicitly).
  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  });

  it('first login: code by email → profile step → register with PDPL consent', async () => {
    await post('/auth/customer/otp/send').send({ channel: 'email', destination: 'Sara@Example.SA' }).expect(204);
    const mail = lastEmail(app, 'sara@example.sa')!;
    expect(mail.subject).toContain('رمز الدخول');
    const code = codeFor('sara@example.sa');

    const v = await post('/auth/customer/otp/verify').send({ destination: 'sara@example.sa', code }).expect(200);
    expect(v.body).toEqual({ isNew: true, profileRequired: true, registrationToken: expect.any(String) });
    expect(v.body.accessToken).toBeUndefined();

    const noConsent = await post('/auth/customer/register')
      .send({ registrationToken: v.body.registrationToken, name: 'سارة', phone: '0501234567', consent: false })
      .expect(400);
    expect(noConsent.body.error.details.fields.consent).toBe('consent_required');
    const badPhone = await post('/auth/customer/register')
      .send({ registrationToken: v.body.registrationToken, name: 'سارة', phone: '0401234567', consent: true })
      .expect(400);
    expect(badPhone.body.error.details.fields.phone).toBe('invalid_phone');

    const r = await post('/auth/customer/register')
      .send({ registrationToken: v.body.registrationToken, name: 'سارة', phone: '0501234567', consent: true })
      .expect(200);
    expect(r.body).toMatchObject({
      isNew: true,
      accessToken: expect.any(String),
      customer: { email: 'sara@example.sa', phone: '+966501234567', emailVerified: true },
    });
    expect(cookieFrom(r, 'nx_rt')).not.toBeNull();
    expect(cookieFrom(r, 'nx_srt')).toBeNull();

    const db = await prisma.customer.findUniqueOrThrow({ where: { email: 'sara@example.sa' } });
    expect(db.consentAt).not.toBeNull();
    const me = await http.get('/api/v1/auth/me').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ typ: 'customer', customer: { name: 'سارة' } });
  });

  it('returning customer: code → tokens directly; a code works once', async () => {
    await post('/auth/customer/otp/send').send({ destination: 'sara@example.sa' }).expect(204);
    const code = codeFor('sara@example.sa');
    const v = await post('/auth/customer/otp/verify').send({ destination: 'sara@example.sa', code }).expect(200);
    expect(v.body).toMatchObject({ isNew: false, accessToken: expect.any(String) });
    await post('/auth/customer/otp/verify').send({ destination: 'sara@example.sa', code }).expect(401);
  });

  it('only the latest code is valid and 5 wrong attempts burn it', async () => {
    await post('/auth/customer/otp/send').send({ destination: 'sara@example.sa' }).expect(204);
    const first = codeFor('sara@example.sa');
    await post('/auth/customer/otp/send').send({ destination: 'sara@example.sa' }).expect(204);
    const second = codeFor('sara@example.sa');
    if (first !== second)
      await post('/auth/customer/otp/verify').send({ destination: 'sara@example.sa', code: first }).expect(401);

    const wrong = second === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await post('/auth/customer/otp/verify').send({ destination: 'sara@example.sa', code: wrong }).expect(401);
    const burned = await post('/auth/customer/otp/verify')
      .send({ destination: 'sara@example.sa', code: second })
      .expect(401);
    expect(burned.body.error.code).toBe('INVALID_CODE');
  });

  it('rate limits OTP sending per destination (5/hour)', async () => {
    for (let i = 0; i < 5; i++)
      await post('/auth/customer/otp/send').send({ destination: 'limit@example.sa' }).expect(204);
    const res = await post('/auth/customer/otp/send').send({ destination: 'LIMIT@example.sa' }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('SMS is refused until an SMS integration exists; blocked customers get no code', async () => {
    const sms = await post('/auth/customer/otp/send').send({ channel: 'sms', destination: '0501234567' }).expect(422);
    expect(sms.body.error.code).toBe('SMS_NOT_AVAILABLE');

    await prisma.customer.create({ data: { name: 'محظور', email: 'blocked@example.sa', status: 'blocked' } });
    await post('/auth/customer/otp/send').send({ destination: 'blocked@example.sa' }).expect(204);
    expect(lastEmail(app, 'blocked@example.sa')).toBeUndefined();
  });

  it('customers cannot reach staff endpoints; refresh uses the customer cookie', async () => {
    await post('/auth/customer/otp/send').send({ destination: 'sara@example.sa' }).expect(204);
    const v = await post('/auth/customer/otp/verify')
      .send({ destination: 'sara@example.sa', code: codeFor('sara@example.sa') })
      .expect(200);
    const token = v.body.accessToken;
    for (const path of ['/admin/settings', '/admin/leads', '/admin/staff']) {
      await http.get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).expect(403);
    }
    const cookie = cookieFrom(v, 'nx_rt')!;
    // A customer cookie cannot be used as a staff session.
    await post('/auth/refresh').set(CSRF).set('Cookie', `nx_srt=${cookie}`).send({ audience: 'staff' }).expect(401);
    const r = await post('/auth/refresh')
      .set(CSRF)
      .set('Cookie', `nx_rt=${cookie}`)
      .send({ audience: 'customer' })
      .expect(200);
    expect(r.body.accessToken).toEqual(expect.any(String));
  });

  it('optional password login, with lockout', async () => {
    await post('/auth/customer/otp/send').send({ destination: 'sara@example.sa' }).expect(204);
    const v = await post('/auth/customer/otp/verify')
      .send({ destination: 'sara@example.sa', code: codeFor('sara@example.sa') })
      .expect(200);
    await post('/auth/customer/password/set')
      .set('Authorization', `Bearer ${v.body.accessToken}`)
      .send({ newPassword: 'Customer-Pass-2026' })
      .expect(204);
    await post('/auth/customer/password/login')
      .send({ email: 'sara@example.sa', password: 'Customer-Pass-2026' })
      .expect(200);
    for (let i = 0; i < 10; i++)
      await post('/auth/customer/password/login')
        .send({ email: 'sara@example.sa', password: `wrong-${i}-password` })
        .expect(401);
    const locked = await post('/auth/customer/password/login')
      .send({ email: 'sara@example.sa', password: 'Customer-Pass-2026' })
      .expect(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('OTP codes are stored hashed only', async () => {
    const rows = await prisma.otpCode.findMany();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.codeHash).not.toMatch(/^\d{6}$/);
  });
});
