import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS } from '../src/redis/redis.module';
import { cookieFrom, createStaff, freshIp, lastEmail, resetDb, totpNow } from './auth-helpers';
import { createTestApp } from './helpers';

const OWNER = { email: 'owner@nx.test', password: 'Initial-Pass-For-Setup-26' };
const STRONG = 'Strong-New-Passw0rd!';
const CSRF = { 'X-Requested-With': 'nx' };

describe('Staff authentication (e2e, docs/03)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let ownerSecret = '';
  let ownerRecovery: string[] = [];

  const post = (path: string) => http.post(`/api/v1${path}`).set('X-Forwarded-For', freshIp());
  const get = (path: string, token?: string) => {
    const r = http.get(`/api/v1${path}`).set('X-Forwarded-For', freshIp());
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  function login(email: string, password: string) {
    return post('/auth/staff/login').send({ email, password });
  }

  /** Full owner login → access token + refresh cookie. Uses one-time recovery codes because each
   * TOTP time step can only be used once (replay protection). */
  async function ownerSession(_offset = 0) {
    const l = await login(OWNER.email, STRONG).expect(200);
    const t = await post('/auth/staff/2fa')
      .send({ challengeId: l.body.challengeId, code: ownerRecovery.pop() })
      .expect(200);
    return { token: t.body.accessToken as string, cookie: cookieFrom(t, 'nx_srt')! };
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
    await createStaff(app, 'owner', OWNER.email, OWNER.password, { mustChangePassword: true });
  });
  afterAll(() => app.close());

  describe('owner first login (acceptance: owner must set 2FA on first login)', () => {
    let challengeId = '';

    it('password OK → forced password change, no tokens yet', async () => {
      const res = await login(OWNER.email, OWNER.password).expect(200);
      expect(res.body).toEqual({ twoFactorRequired: false, next: 'password_change', challengeId: expect.any(String) });
      expect(res.body.accessToken).toBeUndefined();
      expect(cookieFrom(res, 'nx_srt')).toBeNull();
      challengeId = res.body.challengeId;
    });

    it('rejects weak or reused passwords', async () => {
      const weak = await post('/auth/staff/password/initial').send({ challengeId, newPassword: 'short' }).expect(400);
      expect(weak.body.error.code).toBe('VALIDATION_FAILED');
      const reused = await post('/auth/staff/password/initial')
        .send({ challengeId, newPassword: OWNER.password })
        .expect(422);
      expect(reused.body.error.code).toBe('PASSWORD_REUSED');
    });

    it('cannot skip ahead to 2FA setup before the password step', async () => {
      const res = await post('/auth/staff/2fa/setup').send({ challengeId }).expect(409);
      expect(res.body.error.code).toBe('WRONG_STEP');
    });

    it('new password → mandatory 2FA setup (still no tokens)', async () => {
      const res = await post('/auth/staff/password/initial').send({ challengeId, newPassword: STRONG }).expect(200);
      expect(res.body).toMatchObject({ next: 'totp_setup', challengeId });
      expect(res.body.accessToken).toBeUndefined();
    });

    it('setup returns a QR + secret; a wrong code is refused; the right code finishes login', async () => {
      const setup = await post('/auth/staff/2fa/setup').send({ challengeId }).expect(200);
      expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      ownerSecret = setup.body.secret;

      const bad = await post('/auth/staff/2fa/enable').send({ challengeId, code: '000000' }).expect(401);
      expect(bad.body.error.code).toBe('INVALID_CODE');

      const ok = await post('/auth/staff/2fa/enable')
        .send({ challengeId, code: totpNow(ownerSecret) })
        .expect(200);
      expect(ok.body.recoveryCodes).toHaveLength(10);
      expect(ok.body.accessToken).toEqual(expect.any(String));
      ownerRecovery = ok.body.recoveryCodes;

      const raw = (ok.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('nx_srt='))!;
      expect(raw).toMatch(/HttpOnly/);
      expect(raw).toMatch(/SameSite=Lax/);
      expect(raw).toMatch(/Path=\/api\/v1\/auth/);

      const me = await get('/auth/me', ok.body.accessToken).expect(200);
      expect(me.body.staff).toMatchObject({ email: OWNER.email, totpEnabled: true, recoveryCodesLeft: 10 });
      const db = await prisma.staffUser.findUniqueOrThrow({ where: { email: OWNER.email } });
      expect(db.mustChangePassword).toBe(false);
      expect(db.totpSecretEnc).not.toBeNull();
      expect(db.totpRecoveryCodes.join()).not.toContain(ownerRecovery[0]); // stored hashed
    });
  });

  describe('second factor', () => {
    it('requires TOTP on later logins and rejects a replayed code', async () => {
      const code = totpNow(ownerSecret, 1);
      const a = await login(OWNER.email, STRONG).expect(200);
      expect(a.body).toMatchObject({ twoFactorRequired: true, next: 'totp' });
      await post('/auth/staff/2fa').send({ challengeId: a.body.challengeId, code }).expect(200);
      const b = await login(OWNER.email, STRONG).expect(200);
      const replay = await post('/auth/staff/2fa').send({ challengeId: b.body.challengeId, code }).expect(401);
      expect(replay.body.error.code).toBe('INVALID_CODE');
    });

    it('accepts a recovery code exactly once', async () => {
      const a = await login(OWNER.email, STRONG).expect(200);
      await post('/auth/staff/2fa').send({ challengeId: a.body.challengeId, code: ownerRecovery[0] }).expect(200);
      const b = await login(OWNER.email, STRONG).expect(200);
      await post('/auth/staff/2fa').send({ challengeId: b.body.challengeId, code: ownerRecovery[0] }).expect(401);
    });

    it('destroys the challenge after 5 wrong codes', async () => {
      const a = await login(OWNER.email, STRONG).expect(200);
      for (let i = 0; i < 4; i++)
        await post('/auth/staff/2fa').send({ challengeId: a.body.challengeId, code: '111111' }).expect(401);
      const last = await post('/auth/staff/2fa').send({ challengeId: a.body.challengeId, code: '111111' }).expect(429);
      expect(last.body.error.code).toBe('TOO_MANY_ATTEMPTS');
      await post('/auth/staff/2fa')
        .send({ challengeId: a.body.challengeId, code: totpNow(ownerSecret, -1) })
        .expect(401);
      await app.get<Redis>(REDIS).del(...(await app.get<Redis>(REDIS).keys('auth:fail:*')));
    });
  });

  describe('brute force and enumeration', () => {
    it('unknown email and wrong password look identical', async () => {
      const a = await login('nobody@nx.test', 'Whatever-Password-1').expect(401);
      const b = await login(OWNER.email, 'Wrong-Password-123').expect(401);
      expect(a.body.error.code).toBe(b.body.error.code);
      expect(a.body.error.message).toBe(b.body.error.message);
    });

    it('locks the account after 10 failures, even for the correct password', async () => {
      await createStaff(app, 'agent', 'locked@nx.test', 'Agent-Password-2026');
      for (let i = 0; i < 10; i++) await login('locked@nx.test', `bad-password-${i}x`).expect(401);
      const res = await login('locked@nx.test', 'Agent-Password-2026').expect(429);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('limits login attempts per IP (10 / 15 min)', async () => {
      const ip = '203.0.113.77';
      for (let i = 0; i < 10; i++)
        await http
          .post('/api/v1/auth/staff/login')
          .set('X-Forwarded-For', ip)
          .send({ email: `x${i}@nx.test`, password: 'nope-nope-nope' });
      const res = await http
        .post('/api/v1/auth/staff/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'y@nx.test', password: 'nope-nope-nope' })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('refresh tokens', () => {
    it('rotates; requires the CSRF header; reuse revokes the whole session', async () => {
      const s = await ownerSession(-1);
      await post('/auth/refresh').set('Cookie', `nx_srt=${s.cookie}`).send({ audience: 'staff' }).expect(403);

      const r1 = await post('/auth/refresh')
        .set(CSRF)
        .set('Cookie', `nx_srt=${s.cookie}`)
        .send({ audience: 'staff' })
        .expect(200);
      const rotated = cookieFrom(r1, 'nx_srt')!;
      expect(rotated).not.toBe(s.cookie);
      await get('/auth/me', r1.body.accessToken).expect(200);

      // A second tab presenting the old cookie within the grace window gets the same successor.
      const race = await post('/auth/refresh')
        .set(CSRF)
        .set('Cookie', `nx_srt=${s.cookie}`)
        .send({ audience: 'staff' })
        .expect(200);
      expect(cookieFrom(race, 'nx_srt')).toBe(rotated);

      // After the window, replaying the old cookie is theft → family revoked, every token rejected.
      const redis = app.get<Redis>(REDIS);
      const graceKeys = await redis.keys('auth:rt-grace:*');
      if (graceKeys.length) await redis.del(...graceKeys);
      const reuse = await post('/auth/refresh')
        .set(CSRF)
        .set('Cookie', `nx_srt=${s.cookie}`)
        .send({ audience: 'staff' })
        .expect(401);
      expect(reuse.body.error.code).toBe('SESSION_EXPIRED');
      await post('/auth/refresh').set(CSRF).set('Cookie', `nx_srt=${rotated}`).send({ audience: 'staff' }).expect(401);
      await get('/auth/me', r1.body.accessToken).expect(401);
    });

    it('parallel refreshes from two tabs both succeed with one successor', async () => {
      const s = await ownerSession(2);
      const [a, b] = await Promise.all(
        [0, 1].map(() =>
          post('/auth/refresh').set(CSRF).set('Cookie', `nx_srt=${s.cookie}`).send({ audience: 'staff' }),
        ),
      );
      expect([a!.status, b!.status]).toEqual([200, 200]);
      expect(cookieFrom(a!, 'nx_srt')).toBe(cookieFrom(b!, 'nx_srt'));
      await get('/auth/me', b!.body.accessToken).expect(200);
    });

    it('logout ends the session', async () => {
      const s = await ownerSession(1);
      await post('/auth/logout').set(CSRF).set('Cookie', `nx_srt=${s.cookie}`).send({ audience: 'staff' }).expect(204);
      await post('/auth/refresh').set(CSRF).set('Cookie', `nx_srt=${s.cookie}`).send({ audience: 'staff' }).expect(401);
    });

    it('rejects forged or foreign tokens', async () => {
      await get('/auth/me', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.').expect(401);
      const s = await ownerSession(-1);
      const [h, p] = s.token.split('.');
      const tampered = JSON.parse(Buffer.from(p!, 'base64url').toString());
      tampered.perms = ['everything'];
      await get(
        '/auth/me',
        `${h}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${s.token.split('.')[2]}`,
      ).expect(401);
    });
  });

  describe('roles, scopes and staff management', () => {
    let owner: { token: string; cookie: string };
    let agentA = '';
    let agentB = '';
    let tokenA = '';

    beforeAll(async () => {
      await app.get<Redis>(REDIS).del(...(await app.get<Redis>(REDIS).keys('rl:*')).concat('x'));
      owner = await ownerSession(1);
      agentA = (await createStaff(app, 'agent', 'agent.a@nx.test', 'Agent-A-Password-1')).id;
      agentB = (await createStaff(app, 'agent', 'agent.b@nx.test', 'Agent-B-Password-1')).id;
      tokenA = (await login('agent.a@nx.test', 'Agent-A-Password-1').expect(200)).body.accessToken;
      await prisma.lead.createMany({
        data: [
          { number: 'L-000001', type: 'buy', name: 'A1', phone: '+966500000001', assignedToId: agentA },
          { number: 'L-000002', type: 'rent', name: 'B1', phone: '+966500000002', assignedToId: agentB },
          { number: 'L-000003', type: 'contact', name: 'N1', phone: '+966500000003' },
        ],
      });
    });

    it('acceptance: an agent cannot read another agent’s leads', async () => {
      const list = await get('/admin/leads', tokenA).expect(200);
      expect(list.body.items.map((l: { number: string }) => l.number)).toEqual(['L-000001']);
      expect(list.body.total).toBe(1);
      const other = await prisma.lead.findUniqueOrThrow({ where: { number: 'L-000002' } });
      await get(`/admin/leads/${other.id}`, tokenA).expect(404);
      const all = await get('/admin/leads', owner.token).expect(200);
      expect(all.body.total).toBe(3);
    });

    it('permissions are enforced server-side', async () => {
      await get('/admin/staff', tokenA).expect(403);
      await get('/admin/roles', tokenA).expect(403);
      await get('/admin/settings/licensing', tokenA).expect(403);
      const list = await get('/admin/staff', owner.token).expect(200);
      expect(JSON.stringify(list.body)).not.toMatch(/argon2|passwordHash|totpSecret|totpRecoveryCodes/);
    });

    it('sensitive actions require recent re-authentication', async () => {
      // Simulate a session whose last password/TOTP check is older than 10 minutes.
      const s = await ownerSession(-1);
      const redis = app.get<Redis>(REDIS);
      const me = await get('/auth/me', s.token).expect(200);
      const fam = (
        await prisma.refreshToken.findFirstOrThrow({
          where: { subjectId: me.body.staff.id },
          orderBy: { createdAt: 'desc' },
        })
      ).family;
      await redis.set(`auth:authtime:${fam}`, String(Math.floor(Date.now() / 1000) - 3600));
      const stale = await post('/auth/refresh')
        .set(CSRF)
        .set('Cookie', `nx_srt=${s.cookie}`)
        .send({ audience: 'staff' })
        .expect(200);

      const role = await prisma.role.findUniqueOrThrow({ where: { key: 'agent' } });
      const denied = await post('/admin/staff')
        .set('Authorization', `Bearer ${stale.body.accessToken}`)
        .send({ name: 'وكيل جديد', email: 'new.agent@nx.test', roleId: role.id })
        .expect(401);
      expect(denied.body.error.code).toBe('REAUTH_REQUIRED');

      const re = await post('/auth/staff/reauth')
        .set('Authorization', `Bearer ${stale.body.accessToken}`)
        .send({ password: STRONG })
        .expect(200);
      owner.token = re.body.accessToken;
    });

    it('invite → email link → accept → first login', async () => {
      const role = await prisma.role.findUniqueOrThrow({ where: { key: 'agent' } });
      const res = await post('/admin/staff')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'نورة', email: 'noura@nx.test', roleId: role.id, phone: '+966501112233' })
        .expect(201);
      expect(res.body).toMatchObject({ email: 'noura@nx.test', invitePending: true, role: { key: 'agent' } });

      const mail = lastEmail(app, 'noura@nx.test')!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
      await post('/auth/staff/invite/accept').send({ token, password: 'short' }).expect(400);
      await post('/auth/staff/invite/accept').send({ token, password: 'Team-Member-Pass-01' }).expect(204);
      await post('/auth/staff/invite/accept').send({ token, password: 'Team-Member-Pass-02' }).expect(400);
      const l = await login('noura@nx.test', 'Team-Member-Pass-01').expect(200);
      expect(l.body.accessToken).toEqual(expect.any(String)); // agents: 2FA optional

      const dup = await post('/admin/staff')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'نورة', email: 'noura@nx.test', roleId: role.id })
        .expect(409);
      expect(dup.body.error.code).toBe('EMAIL_IN_USE');
    });

    it('admins cannot touch the owner; the last owner cannot be removed', async () => {
      await createStaff(app, 'admin', 'admin@nx.test', 'Admin-Password-2026');
      // Admin must set up 2FA first; finish that flow to get a token.
      const a = await login('admin@nx.test', 'Admin-Password-2026').expect(200);
      expect(a.body.next).toBe('totp_setup');
      const setup = await post('/auth/staff/2fa/setup').send({ challengeId: a.body.challengeId }).expect(200);
      const adminTok = (
        await post('/auth/staff/2fa/enable')
          .send({ challengeId: a.body.challengeId, code: totpNow(setup.body.secret) })
          .expect(200)
      ).body.accessToken;

      const ownerRow = await prisma.staffUser.findUniqueOrThrow({ where: { email: OWNER.email } });
      const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'owner' } });
      await http
        .patch(`/api/v1/admin/staff/${ownerRow.id}`)
        .set('Authorization', `Bearer ${adminTok}`)
        .send({ isActive: false })
        .expect(403);
      await http
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminTok}`)
        .send({ name: 'مالك', email: 'o2@nx.test', roleId: ownerRole.id })
        .expect(403);
      const self = await http
        .patch(`/api/v1/admin/staff/${ownerRow.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ isActive: false })
        .expect(403);
      expect(self.body.error.message).toContain('بنفسك');
    });

    it('deactivating a member kills their live access token immediately', async () => {
      await get('/admin/leads', tokenA).expect(200);
      await http
        .patch(`/api/v1/admin/staff/${agentA}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ isActive: false })
        .expect(200);
      await get('/admin/leads', tokenA).expect(401);
      await login('agent.a@nx.test', 'Agent-A-Password-1').expect(401);
    });

    it('custom roles: system roles are read-only; custom role permissions apply', async () => {
      const roles = await get('/admin/roles', owner.token).expect(200);
      const agentRole = roles.body.items.find((r: { key: string }) => r.key === 'agent');
      await http
        .patch(`/api/v1/admin/roles/${agentRole.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ nameAr: 'x y' })
        .expect(422);
      const bad = await http
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ nameAr: 'مسوّق', permissions: ['root.everything'] })
        .expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      const created = await http
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ nameAr: 'مسوّق', permissions: ['dashboard.view', 'seo.manage'] })
        .expect(201);
      expect(created.body.key).toMatch(/^custom_/);
    });

    it('audit log records staff changes without secrets', async () => {
      const rows = await prisma.auditLog.findMany({ where: { entityType: 'staff' } });
      expect(rows.map((r) => r.action)).toEqual(
        expect.arrayContaining(['staff.invite', 'staff.update', 'auth.staff.login']),
      );
      expect(JSON.stringify(rows)).not.toMatch(/argon2|Strong-New-Passw0rd/);
    });
  });

  describe('forgot / reset password', () => {
    it('no enumeration; reset link works once and ends existing sessions', async () => {
      await createStaff(app, 'sales_manager', 'sm@nx.test', 'Sales-Manager-Pass-1');
      const before = (await login('sm@nx.test', 'Sales-Manager-Pass-1').expect(200)).body.accessToken;

      await post('/auth/staff/password/forgot').send({ email: 'ghost@nx.test' }).expect(204);
      expect(lastEmail(app, 'ghost@nx.test')).toBeUndefined();

      await post('/auth/staff/password/forgot').send({ email: 'SM@nx.test' }).expect(204);
      const mail = lastEmail(app, 'sm@nx.test')!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
      await post('/auth/staff/password/reset').send({ token, newPassword: 'Sales-Manager-Pass-2' }).expect(204);
      await post('/auth/staff/password/reset').send({ token, newPassword: 'Sales-Manager-Pass-3' }).expect(400);

      await get('/auth/me', before).expect(401);
      await login('sm@nx.test', 'Sales-Manager-Pass-1').expect(401);
      await login('sm@nx.test', 'Sales-Manager-Pass-2').expect(200);
    });
  });

  describe('settings endpoints', () => {
    it('per-section permissions and re-auth for payment settings', async () => {
      await createStaff(app, 'content_editor', 'editor@nx.test', 'Content-Editor-Pass-1');
      const tok = (await login('editor@nx.test', 'Content-Editor-Pass-1').expect(200)).body.accessToken;
      const all = await get('/admin/settings', tok).expect(200);
      expect(Object.keys(all.body.sections).sort()).toEqual(['branding', 'legal', 'seo']);
      await http.put('/api/v1/admin/settings/licensing').set('Authorization', `Bearer ${tok}`).send({}).expect(403);
      const ok = await http
        .put('/api/v1/admin/settings/legal')
        .set('Authorization', `Bearer ${tok}`)
        .send({ aboutHtml: '<p>نحن</p><script>x</script>' })
        .expect(200);
      expect(ok.body.aboutHtml).toBe('<p>نحن</p>');
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'settings.update', entityId: 'legal' } });
      expect(audit.actorType).toBe('staff');
    });
  });
});
