import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import nock from 'nock';
import sharp from 'sharp';
import request from 'supertest';
import { seedDemo } from '../src/cli/seed-demo';
import { MediaService, type MediaJob } from '../src/modules/media/media.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MEDIA_QUEUE } from '../src/queue/queue.module';
import { REDIS } from '../src/redis/redis.module';
import { createStaff, freshIp, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

const R2 = 'https://acct0123456789.r2.cloudflarestorage.com';

describe('Listings (e2e, Phase 3)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let manager = '';
  let agentA = '';
  let agentB = '';
  let agentAId = '';
  let districtId = '';

  const as = (token: string, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) =>
    http[method](`/api/v1${path}`).set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${token}`);
  const login = async (email: string, password: string) =>
    (
      await http
        .post('/api/v1/auth/staff/login')
        .set('X-Forwarded-For', freshIp())
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;

  const draft = (over: Record<string, unknown> = {}) => ({
    type: 'villa',
    offer: 'sale',
    title: 'فيلا اختبار في الملقا',
    description: 'فيلا حديثة للاختبار بمساحات واسعة.',
    cityId: 'riyadh',
    districtId,
    lat: 24.81,
    lng: 46.62,
    price: 300_000_000,
    specs: { area: 400, bedrooms: 5 },
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
    await prisma.city.upsert({
      where: { id: 'riyadh' },
      create: { id: 'riyadh', nameAr: 'الرياض', lat: 24.7136, lng: 46.6753 },
      update: {},
    });
    for (const c of [
      ['jeddah', 'جدة', 21.5433, 39.1728],
      ['dammam', 'الدمام', 26.4207, 50.0888],
      ['khobar', 'الخبر', 26.2172, 50.1971],
      ['makkah', 'مكة المكرمة', 21.3891, 39.8579],
      ['madinah', 'المدينة المنورة', 24.5247, 39.5692],
    ] as const) {
      await prisma.city.upsert({
        where: { id: c[0] },
        create: { id: c[0], nameAr: c[1], lat: c[2], lng: c[3] },
        update: {},
      });
    }
    districtId = (
      await prisma.district.upsert({
        where: { cityId_nameAr: { cityId: 'riyadh', nameAr: 'الملقا' } },
        create: { cityId: 'riyadh', nameAr: 'الملقا' },
        update: {},
      })
    ).id;
    await createStaff(app, 'sales_manager', 'manager@nx.test', 'Manager-Password-26');
    agentAId = (await createStaff(app, 'agent', 'agent.one@nx.test', 'Agent-One-Pass-2026')).id;
    await createStaff(app, 'agent', 'agent.two@nx.test', 'Agent-Two-Pass-2026');
    manager = await login('manager@nx.test', 'Manager-Password-26');
    agentA = await login('agent.one@nx.test', 'Agent-One-Pass-2026');
    agentB = await login('agent.two@nx.test', 'Agent-Two-Pass-2026');
    await app.get<Queue>(MEDIA_QUEUE).obliterate({ force: true });
  });
  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await app.close();
  });

  describe('acceptance: agents create/edit only their own listings', () => {
    let ownId = 0;

    it('an agent creates a draft that is always assigned to them', async () => {
      const res = await as(agentA, 'post', '/admin/properties').send(draft()).expect(201);
      expect(res.body).toMatchObject({
        visibility: 'draft',
        agentId: agentAId,
        code: `MZ-${res.body.id}`,
        slug: 'فيلا-اختبار-في-الملقا',
        canEdit: true,
      });
      expect(res.body.id).toBeGreaterThanOrEqual(1001);
      ownId = res.body.id;
      const other = await as(agentA, 'post', '/admin/properties')
        .send(draft({ agentId: 'someone-else-id' }))
        .expect(403);
      expect(other.body.error.code).toBe('FORBIDDEN');
    });

    it('another agent can see it but not edit, change status, duplicate or add media', async () => {
      const seen = await as(agentB, 'get', `/admin/properties/${ownId}`).expect(200);
      expect(seen.body.canEdit).toBe(false);
      await as(agentB, 'patch', `/admin/properties/${ownId}`).send({ title: 'محاولة تعديل غير مسموحة' }).expect(403);
      await as(agentB, 'post', `/admin/properties/${ownId}/status`).send({ status: 'negotiation' }).expect(403);
      await as(agentB, 'post', `/admin/properties/${ownId}/duplicate`).expect(403);
      await as(agentB, 'post', '/admin/media/presign')
        .send({ propertyId: ownId, kind: 'photo', contentType: 'image/jpeg', size: 1000 })
        .expect(403);
    });

    it('the owner agent edits; agents cannot publish or delete at all', async () => {
      await as(agentA, 'patch', `/admin/properties/${ownId}`).send({ title: 'فيلا اختبار معدّلة' }).expect(200);
      await as(agentA, 'post', `/admin/properties/${ownId}/publish`).expect(403);
      await as(agentA, 'delete', `/admin/properties/${ownId}`).expect(403);
      const hist = await as(agentA, 'get', `/admin/properties/${ownId}/history`).expect(200);
      expect(hist.body.audit.map((a: { action: string }) => a.action)).toEqual(['property.update', 'property.create']);
    });
  });

  describe('acceptance: publish is blocked without an ad licence', () => {
    it('explains every blocker and publishes once fixed', async () => {
      const p = (
        await as(manager, 'post', '/admin/properties')
          .send(draft({ title: 'فيلا بدون ترخيص بعد' }))
          .expect(201)
      ).body;
      expect(p.publishProblems.map((x: { code: string }) => x.code)).toEqual(
        expect.arrayContaining(['license_missing', 'specs_incomplete', 'no_photos']),
      );
      const blocked = await as(manager, 'post', `/admin/properties/${p.id}/publish`).expect(422);
      expect(blocked.body.error).toMatchObject({
        code: 'PUBLISH_BLOCKED',
        message: 'أدخل رقم ترخيص الإعلان ورقم رخصة فال قبل النشر',
      });

      await as(manager, 'patch', `/admin/properties/${p.id}`)
        .send({
          specs: {
            area: 400,
            bedrooms: 5,
            adLicense: '7200009999',
            falLicense: '1100000101',
            licenseExpiry: '2020-01-01',
          },
        })
        .expect(200);
      const expired = await as(manager, 'post', `/admin/properties/${p.id}/publish`).expect(422);
      expect(expired.body.error.details.problems).toContain('license_expired');

      await as(manager, 'patch', `/admin/properties/${p.id}`)
        .send({
          specs: {
            area: 400,
            bedrooms: 5,
            adLicense: '7200009999',
            falLicense: '1100000101',
            licenseExpiry: '2030-01-01',
          },
        })
        .expect(200);
      await prisma.propertyMedia.create({
        data: { propertyId: p.id, kind: 'photo', status: 'ready', variants: { card: 'https://cdn.example.sa/x.jpg' } },
      });
      const ok = await as(manager, 'post', `/admin/properties/${p.id}/publish`).expect(200);
      expect(ok.body).toMatchObject({ visibility: 'published', publishProblems: [] });
      // A published listing cannot drop its licence afterwards.
      const strip = await as(manager, 'patch', `/admin/properties/${p.id}`)
        .send({ specs: { area: 400 } })
        .expect(400);
      expect(Object.keys(strip.body.error.details.fields)).toEqual(expect.arrayContaining(['specs.adLicense']));
    });
  });

  describe('validation and status rules', () => {
    it('rejects invalid specs, offers, coordinates, HTML and mismatched districts', async () => {
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ specs: { area: 400, wells: 3 } }, 'specs._'],
        [{ type: 'farm', offer: 'rent', rentPeriod: 'yearly' }, 'offer'],
        [{ offer: 'rent' }, 'rentPeriod'],
        [{ lat: 51.5, lng: -0.12 }, 'lat'],
        [{ title: '<img src=x onerror=alert(1)>' }, 'title'],
        [{ description: 'وصف <script>alert(1)</script> طويل بما يكفي' }, 'description'],
        [{ price: 0 }, 'price'],
      ];
      for (const [over, field] of cases) {
        const res = await as(manager, 'post', '/admin/properties').send(draft(over)).expect(400);
        expect(Object.keys(res.body.error.details.fields).join()).toContain(field.split('.')[0]!);
      }
      const jeddah = await prisma.district.upsert({
        where: { cityId_nameAr: { cityId: 'jeddah', nameAr: 'الشاطئ' } },
        create: { cityId: 'jeddah', nameAr: 'الشاطئ' },
        update: {},
      });
      const res = await as(manager, 'post', '/admin/properties')
        .send(draft({ districtId: jeddah.id }))
        .expect(400);
      expect(res.body.error.details.fields.districtId).toBe('district_not_in_city');
    });

    it('limits statuses to the offer and records history', async () => {
      const p = (
        await as(manager, 'post', '/admin/properties')
          .send(draft({ offer: 'rent', rentPeriod: 'monthly', price: 600_000 }))
          .expect(201)
      ).body;
      expect(p.annualisedPrice).toBe(7_200_000);
      await as(manager, 'post', `/admin/properties/${p.id}/status`).send({ status: 'sold' }).expect(400);
      await as(manager, 'post', `/admin/properties/${p.id}/status`)
        .send({ status: 'rented', reason: 'تم التأجير' })
        .expect(200);
      const h = await prisma.propertyStatusHistory.findMany({ where: { propertyId: p.id } });
      expect(h).toEqual([
        expect.objectContaining({ from: 'available', to: 'rented', reason: 'تم التأجير', actorType: 'staff' }),
      ]);
    });
  });

  describe('public endpoints (frontend contract)', () => {
    beforeAll(async () => {
      await prisma.property.deleteMany();
      await seedDemo(prisma as never, { env: 'test' });
      await app.get<Redis>(REDIS).incr('pub:ver');
    });

    it('lists only published, closed last, with the frontend shape', async () => {
      const res = await http.get('/api/v1/public/properties?pageSize=100').expect(200);
      expect(res.body.total).toBe(26);
      expect(res.headers['cache-control']).toContain('max-age=30');
      const p = res.body.items.find((x: { id: number }) => x.id === 1001);
      expect(p).toMatchObject({
        code: 'MZ-1001',
        price: 4_850_000,
        priceHalalas: 485_000_000,
        city: 'riyadh',
        cityLabel: 'الرياض',
        district: 'الملقا',
        url: expect.stringMatching(/^\/property\/1001-/),
      });
      expect(p.agent).toEqual({
        id: expect.any(String),
        name: 'فهد العتيبي',
        role: 'مستشار عقاري أول',
        phone: '+966500000001',
        whatsapp: '966500000001',
        fal: '1100000101',
      });
      const statuses = res.body.items.map((x: { status: string }) => x.status);
      const firstClosed = statuses.findIndex((s: string) => s === 'sold' || s === 'rented');
      expect(statuses.slice(firstClosed).every((s: string) => s === 'sold' || s === 'rented')).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|email|createdById|adLicenseCheck/);
    });

    it('applies the documented filters and paginates across open/closed', async () => {
      const rent = await http.get('/api/v1/public/properties?offer=rent&hideClosed=1').expect(200);
      expect(
        rent.body.items.every((x: { offer: string; status: string }) => x.offer === 'rent' && x.status !== 'rented'),
      ).toBe(true);
      const cheap = await http.get('/api/v1/public/properties?offer=rent&priceMax=100000&sort=price_asc').expect(200);
      const prices = cheap.body.items.map((x: { price: number }) => x.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
      const pool = await http.get('/api/v1/public/properties?features=pool&types=villa').expect(200);
      expect(
        pool.body.items.every(
          (x: { specs: { pool?: boolean }; type: string }) => x.specs.pool === true && x.type === 'villa',
        ),
      ).toBe(true);
      const ids = await http.get('/api/v1/public/properties?ids=1002,1001,999999').expect(200);
      expect(ids.body.items.map((x: { id: number }) => x.id).sort()).toEqual([1001, 1002]);
      const page1 = (await http.get('/api/v1/public/properties?pageSize=20&page=1').expect(200)).body.items.map(
        (x: { id: number }) => x.id,
      );
      const page2 = (await http.get('/api/v1/public/properties?pageSize=20&page=2').expect(200)).body.items.map(
        (x: { id: number }) => x.id,
      );
      expect(new Set([...page1, ...page2]).size).toBe(26);
      await http.get('/api/v1/public/properties?types=castle').expect(400);
      await http.get('/api/v1/public/properties?pageSize=1000').expect(400);
    });

    it('search, detail, similar, stats and 404 for drafts', async () => {
      const q = await http.get(`/api/v1/public/properties?q=${encodeURIComponent('مزرعة')}`).expect(200);
      expect(q.body.items.some((x: { type: string }) => x.type === 'farm')).toBe(true);
      const code = await http.get('/api/v1/public/properties?q=MZ-1004').expect(200);
      expect(code.body.items.map((x: { id: number }) => x.id)).toContain(1004);
      await http.get(`/api/v1/public/properties?q=${encodeURIComponent("%' OR 1=1 --")}`).expect(200);

      const d = await http.get('/api/v1/public/properties/1004').expect(200);
      expect(d.body.specs).toMatchObject({ annualIncome: 9_800_000, roi: 6.8 });
      const sim = await http.get('/api/v1/public/properties/1001/similar?limit=3').expect(200);
      expect(sim.body).toHaveLength(3);
      expect(sim.body.every((x: { status: string }) => !['sold', 'rented'].includes(x.status))).toBe(true);
      const stats = await http.get('/api/v1/public/stats').expect(200);
      expect(stats.body.total).toBe(23);

      await prisma.property.update({ where: { id: 1003 }, data: { visibility: 'draft' } });
      await app.get<Redis>(REDIS).incr('pub:ver');
      await http.get('/api/v1/public/properties/1003').expect(404);
      await prisma.property.update({ where: { id: 1003 }, data: { visibility: 'published' } });
    });

    it('counts a view once per visitor per 30 minutes', async () => {
      const before = (await prisma.property.findUniqueOrThrow({ where: { id: 1002 } })).viewCount;
      for (let i = 0; i < 3; i++)
        await http.get('/api/v1/public/properties/1002').set('X-Forwarded-For', '203.0.113.50').expect(200);
      await http.get('/api/v1/public/properties/1002').set('X-Forwarded-For', '203.0.113.51').expect(200);
      expect((await prisma.property.findUniqueOrThrow({ where: { id: 1002 } })).viewCount).toBe(before + 2);
    });

    it('public config exposes no secrets and the merged schema has the cities', async () => {
      const cfg = await http.get('/api/v1/public/config').expect(200);
      expect(cfg.body).toMatchObject({
        brand: { name: 'منزلة' },
        map: { provider: 'osm', googleBrowserKey: null },
        currency: 'ر.س',
      });
      expect(JSON.stringify(cfg.body)).not.toMatch(/secret|serverKey|apiKey/i);
      const schema = await http.get('/api/v1/public/schema').expect(200);
      expect(schema.body.cities.find((c: { id: string }) => c.id === 'riyadh').districts).toContain('الملقا');
    });
  });

  describe('public leads (forms)', () => {
    it('creates a numbered lead assigned to the listing agent, plus a viewing', async () => {
      const res = await http
        .post('/api/v1/public/leads')
        .set('X-Forwarded-For', '198.18.0.1')
        .set('Idempotency-Key', 'lead-key-0001')
        .send({
          type: 'viewing',
          propertyId: 1001,
          name: 'سارة',
          phone: '0501234567',
          date: '2030-01-15',
          slot: 'afternoon',
          notes: 'بعد العصر',
          consent: true,
        })
        .expect(201);
      expect(res.body.number).toMatch(/^L-\d{6}$/);
      const again = await http
        .post('/api/v1/public/leads')
        .set('X-Forwarded-For', '198.18.0.1')
        .set('Idempotency-Key', 'lead-key-0001')
        .send({
          type: 'viewing',
          propertyId: 1001,
          name: 'سارة',
          phone: '0501234567',
          date: '2030-01-15',
          slot: 'afternoon',
          consent: true,
        })
        .expect(201);
      expect(again.body).toEqual(res.body);
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { number: res.body.number },
        include: { viewings: true, property: true },
      });
      expect(lead).toMatchObject({
        phone: '+966501234567',
        assignedToId: lead.property!.agentId,
        source: 'website',
        consent: true,
      });
      expect(lead.viewings[0]!.scheduledAt.toISOString()).toBe('2030-01-15T13:00:00.000Z'); // 4 pm Riyadh
    });

    it('validates consent, phone, property and rate limits per IP', async () => {
      const base = {
        type: 'contact',
        name: 'أحمد',
        phone: '0551234567',
        consent: true,
        budget: '2,000,000',
        city: 'riyadh',
      };
      await http
        .post('/api/v1/public/leads')
        .set('X-Forwarded-For', '198.18.0.2')
        .send({ ...base, consent: false })
        .expect(400);
      await http
        .post('/api/v1/public/leads')
        .set('X-Forwarded-For', '198.18.0.2')
        .send({ ...base, phone: '12345' })
        .expect(400);
      await http
        .post('/api/v1/public/leads')
        .set('X-Forwarded-For', '198.18.0.2')
        .send({ ...base, type: 'viewing' })
        .expect(400);
      const ok = await http.post('/api/v1/public/leads').set('X-Forwarded-For', '198.18.0.2').send(base).expect(201);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { number: ok.body.number } });
      expect(lead.budget).toBe(200_000_000n);
      for (let i = 0; i < 10; i++)
        await http.post('/api/v1/public/leads').set('X-Forwarded-For', '198.18.0.3').send(base).expect(201);
      await http.post('/api/v1/public/leads').set('X-Forwarded-For', '198.18.0.3').send(base).expect(429);
    });
  });

  describe('media pipeline', () => {
    it('refuses uploads until storage is configured', async () => {
      const res = await as(manager, 'post', '/admin/media/presign')
        .send({ propertyId: 1001, kind: 'photo', contentType: 'image/jpeg', size: 2000 })
        .expect(422);
      expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
    });

    it('presign → upload → process: variants rendered and published to the CDN bucket', async () => {
      nock.disableNetConnect();
      nock.enableNetConnect(/127\.0\.0\.1|localhost/);
      await prisma.integration.upsert({
        where: { key: 'storage.r2' },
        create: {
          key: 'storage.r2',
          category: 'storage',
          enabled: true,
          config: {
            accountId: 'acct0123456789',
            uploadsBucket: 'uploads',
            mediaBucket: 'media',
            publicBaseUrl: 'https://cdn.example.sa',
          },
        },
        update: {
          enabled: true,
          config: {
            accountId: 'acct0123456789',
            uploadsBucket: 'uploads',
            mediaBucket: 'media',
            publicBaseUrl: 'https://cdn.example.sa',
          },
        },
      });
      const admin = await createStaff(app, 'content_editor', 'editor@nx.test', 'Content-Editor-Pass-1');
      const editor = await login('editor@nx.test', 'Content-Editor-Pass-1');
      // Secrets through the store so they are encrypted like in production.
      const { IntegrationStore } = await import('../src/modules/integrations/integration-store.service');
      await app
        .get(IntegrationStore)
        .update(
          'storage.r2',
          { secrets: { accessKeyId: 'AKIAEXAMPLE0002', secretAccessKey: 'secret-access-key-example-0002' } },
          admin.id,
        );

      await as(editor, 'post', '/admin/media/presign')
        .send({ propertyId: 1001, kind: 'photo', contentType: 'image/svg+xml', size: 2000 })
        .expect(400);
      await as(editor, 'post', '/admin/media/presign')
        .send({ propertyId: 1001, kind: 'photo', contentType: 'image/jpeg', size: 16 * 1024 * 1024 })
        .expect(413);
      const pre = await as(editor, 'post', '/admin/media/presign')
        .send({ propertyId: 1001, kind: 'photo', contentType: 'image/jpeg', size: 5000 })
        .expect(200);
      expect(pre.body.uploadUrl).toMatch(
        /^https:\/\/acct0123456789\.r2\.cloudflarestorage\.com\/uploads\/originals\/1001\//,
      );
      await as(editor, 'post', `/admin/media/${pre.body.mediaId}/complete`).expect(202);

      const jpeg = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#0F4C3A' } })
        .jpeg()
        .toBuffer();
      const puts: string[] = [];
      nock(R2)
        .get(new RegExp(`/uploads/${pre.body.key.replace(/[.]/g, '\\.')}`))
        .reply(200, jpeg, { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.length) });
      nock(R2)
        .put(/\/media\/p\/1001\//)
        .times(6)
        .reply(function (uri) {
          puts.push(uri);
          return [200, ''];
        });
      const queue = app.get<Queue<MediaJob>>(MEDIA_QUEUE);
      const [job] = await queue.getJobs(['waiting']);
      await app.get(MediaService).process(job!.data.mediaId);

      const m = await prisma.propertyMedia.findUniqueOrThrow({ where: { id: pre.body.mediaId } });
      expect(m).toMatchObject({ status: 'ready', width: 1600, height: 1000 });
      expect(Object.keys(m.variants as object).sort()).toEqual([
        'card',
        'full',
        'thumb',
        'webpCard',
        'webpFull',
        'webpThumb',
      ]);
      expect((m.variants as Record<string, string>).webpCard).toMatch(
        /^https:\/\/cdn\.example\.sa\/p\/1001\/.+-card\.webp$/,
      );
      expect(puts).toHaveLength(6);
    });

    it('a non-image upload ends as failed and is removed', async () => {
      const editor = await login('editor@nx.test', 'Content-Editor-Pass-1');
      const pre = await as(editor, 'post', '/admin/media/presign')
        .send({ propertyId: 1001, kind: 'photo', contentType: 'image/png', size: 100 })
        .expect(200);
      nock(R2)
        .get(/\/uploads\//)
        .reply(200, Buffer.from('<html>not an image</html>'), { 'Content-Length': '25' });
      nock(R2)
        .delete(/\/uploads\//)
        .reply(204);
      await app.get(MediaService).process(pre.body.mediaId);
      expect((await prisma.propertyMedia.findUniqueOrThrow({ where: { id: pre.body.mediaId } })).status).toBe('failed');
    });

    it('video links only from YouTube or Vimeo', async () => {
      const editor = await login('editor@nx.test', 'Content-Editor-Pass-1');
      await as(editor, 'post', '/admin/media/video').send({ propertyId: 1001, url: 'javascript:alert(1)' }).expect(400);
      await as(editor, 'post', '/admin/media/video')
        .send({ propertyId: 1001, url: 'https://evil.example/watch?v=abc' })
        .expect(400);
      await as(editor, 'post', '/admin/media/video')
        .send({ propertyId: 1001, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
        .expect(201);
    });
  });
});
