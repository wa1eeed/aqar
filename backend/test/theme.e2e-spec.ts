import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { defaultsFor } from '../src/modules/settings/schemas';
import { createStaff, freshIp, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

describe('Branding & theme (e2e, Phase 6)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let designer = '';
  let agent = '';

  const login = async (email: string, password: string) =>
    (
      await http
        .post('/api/v1/auth/staff/login')
        .set('X-Forwarded-For', freshIp())
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;
  const as = (t: string, m: 'get' | 'put' | 'post', path: string) =>
    http[m](path).set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${t}`);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
    await prisma.settingsSection.deleteMany({ where: { key: 'branding' } });
    const role = await prisma.role.create({
      data: { key: 'custom_designer', nameAr: 'مصمم', isSystem: false, permissions: ['settings.branding'] },
    });
    const s = await createStaff(app, 'agent', 'designer@nx.test', 'Designer-Pass-2026');
    await prisma.staffUser.update({ where: { id: s.id }, data: { roleId: role.id } });
    await createStaff(app, 'agent', 'agent6@nx.test', 'Agent-Six-Pass-2026');
    designer = await login('designer@nx.test', 'Designer-Pass-2026');
    agent = await login('agent6@nx.test', 'Agent-Six-Pass-2026');
  });
  afterAll(() => app.close());

  it('acceptance: changing the primary colour changes /theme.css (versioned, cacheable)', async () => {
    const before = await http.get('/theme.css').expect(200);
    expect(before.headers['content-type']).toContain('text/css');
    expect(before.text).toContain('--green: #0F4C3A');
    expect(before.headers['cache-control']).toContain('must-revalidate');
    const v1 = (await http.get('/api/v1/public/config').expect(200)).body.theme.version as string;
    expect((await http.get(`/theme.css?v=${v1}`).expect(200)).headers['cache-control']).toContain('immutable');
    await http.get('/theme.css').set('If-None-Match', `"${v1}"`).expect(304);

    const next = {
      ...defaultsFor('branding'),
      theme: { ...defaultsFor('branding').theme, primary: '#1D3A8A', primaryDark: '#122459' },
    };
    await as(agent, 'put', '/api/v1/admin/settings/branding').send(next).expect(403);
    await as(designer, 'put', '/api/v1/admin/settings/branding').send(next).expect(200);
    const after = await http.get('/theme.css').expect(200);
    expect(after.text).toContain('--green: #1D3A8A');
    const v2 = (await http.get('/api/v1/public/config').expect(200)).body.theme.version as string;
    expect(v2).not.toBe(v1);
  });

  it('the contrast guard blocks unreadable colours; only the owner may override', async () => {
    const weak = { ...defaultsFor('branding'), theme: { ...defaultsFor('branding').theme, primary: '#D9F2E6' } };
    const r = await as(designer, 'put', '/api/v1/admin/settings/branding').send(weak).expect(422);
    expect(r.body.error.code).toBe('THEME_LOW_CONTRAST');
    expect(r.body.error.details.pairs.map((p: { pair: string }) => p.pair)).toContain('white/primary');
    await as(designer, 'put', '/api/v1/admin/settings/branding')
      .send({ ...weak, contrastOverride: true })
      .expect(422);
  });

  it('brand uploads: favicon sizes, logos, unsafe SVG refused, files served with long cache', async () => {
    const png512 = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0F4C3A' } })
      .png()
      .toBuffer();
    const up = await as(designer, 'post', '/api/v1/admin/settings/branding/assets/favicon')
      .attach('file', png512, { filename: 'icon.png', contentType: 'image/png' })
      .expect(200);
    expect(up.body.url).toMatch(/^\/brand\/favicon-[a-f0-9]{10}-512\.png$/);
    for (const size of [16, 32, 180, 192, 512]) {
      const f = await http.get(up.body.url.replace('-512.png', `-${size}.png`)).expect(200);
      expect(f.headers['content-type']).toBe('image/png');
      expect(f.headers['cache-control']).toContain('immutable');
      expect((await sharp(f.body).metadata()).width).toBe(size);
    }
    const wide = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await as(designer, 'post', '/api/v1/admin/settings/branding/assets/favicon')
      .attach('file', wide, { filename: 'w.png', contentType: 'image/png' })
      .expect(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await as(designer, 'post', '/api/v1/admin/settings/branding/assets/logo')
      .attach('file', svg, { filename: 'x.svg', contentType: 'image/svg+xml' })
      .expect(400);
    const okSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    );
    const logo = await as(designer, 'post', '/api/v1/admin/settings/branding/assets/logo')
      .attach('file', okSvg, { filename: 'l.svg', contentType: 'image/svg+xml' })
      .expect(200);
    const served = await http.get(logo.body.url).expect(200);
    expect(served.headers['content-security-policy']).toContain("default-src 'none'");
    await as(agent, 'post', '/api/v1/admin/settings/branding/assets/logo')
      .attach('file', okSvg, { filename: 'l.svg', contentType: 'image/svg+xml' })
      .expect(403);
    await http.get('/brand/..%2F..%2Fetc%2Fpasswd').expect(404);

    // Saved settings may point at uploaded files; the manifest uses the generated icons.
    const b = { ...defaultsFor('branding'), faviconUrl: up.body.url, logoUrl: logo.body.url };
    await as(designer, 'put', '/api/v1/admin/settings/branding').send(b).expect(200);
    const m = await http.get('/site.webmanifest').expect(200);
    expect(m.body.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
    expect((await http.get('/api/v1/public/config').expect(200)).body.brand.logoUrl).toBe(logo.body.url);
    await as(designer, 'put', '/api/v1/admin/settings/branding')
      .send({ ...b, logoUrl: '/etc/passwd' })
      .expect(400);
  });
});
