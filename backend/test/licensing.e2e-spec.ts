import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import request from 'supertest';
import { LicenseReminders, thresholdFor } from '../src/modules/notifications/license-reminders';
import { defaultsFor } from '../src/modules/settings/schemas';
import { SettingsService } from '../src/modules/settings/settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS } from '../src/redis/redis.module';
import { createStaff, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

describe('Licensing (e2e, Phase 6)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let settings: SettingsService;
  let adminId = '';
  let agentId = '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    settings = app.get(SettingsService);
    await resetDb(app);
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('lic:remind:*');
    if (keys.length) await redis.del(...keys);
    adminId = (await createStaff(app, 'admin', 'admin6@nx.test', 'Admin-Six-Pass-2026')).id;
    agentId = (await createStaff(app, 'agent', 'agent7@nx.test', 'Agent-Seven-Pass-2026')).id;
  });
  afterAll(() => app.close());

  it('thresholds: 60/30/7 days, tightest reached', () => {
    expect([90, 60, 45, 30, 20, 7, 1, -3].map(thresholdFor)).toEqual([null, 60, 60, 30, 30, 7, 7, 7]);
  });

  it('public config exposes the display options and numbers (no secrets)', async () => {
    await settings.update(
      'licensing',
      {
        ...defaultsFor('licensing'),
        regaFalLicense: '1100012345',
        ejarMembership: '0045812',
        showEjarOnRentOnly: false,
        nationalAddress: 'RRRD2929',
      },
      null,
    );
    const r = await request(app.getHttpServer()).get('/api/v1/public/config').expect(200);
    expect(r.body.licensing).toMatchObject({
      regaFalLicense: '1100012345',
      ejarMembership: '0045812',
      showOnPropertyPage: true,
      showEjarOnRentOnly: false,
      nationalAddress: 'RRRD2929',
    });
  });

  it('FAL expiry and listing ad licences remind once per threshold', async () => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000);
    await settings.update(
      'licensing',
      { ...defaultsFor('licensing'), regaFalExpiry: day(20).toISOString().slice(0, 10) },
      null,
    );
    await prisma.city.upsert({
      where: { id: 'riyadh' },
      create: { id: 'riyadh', nameAr: 'الرياض', lat: 24.71, lng: 46.67 },
      update: {},
    });
    const district = await prisma.district.upsert({
      where: { cityId_nameAr: { cityId: 'riyadh', nameAr: 'الملقا' } },
      create: { cityId: 'riyadh', nameAr: 'الملقا' },
      update: {},
    });
    await prisma.property.create({
      data: {
        id: 7601,
        code: 'MZ-7601',
        slug: 'x-7601',
        type: 'villa' as const,
        offer: 'sale',
        status: 'available',
        visibility: 'published',
        title: 'فيلا اختبار الترخيص',
        description: 'وصف',
        cityId: 'riyadh',
        districtId: district.id,
        lat: 24.7,
        lng: 46.6,
        price: 100_000_000n,
        annualisedPrice: 100_000_000n,
        specs: { area: 300 },
        area: 300,
        adLicenseNo: '7200000001',
        falLicenseNo: '1100000001',
        licenseExpiry: day(5),
        agentId,
        createdById: agentId,
        publishedAt: new Date(),
      },
    });
    const jobs = app.get(LicenseReminders);
    expect(await jobs.run()).toBe(2);
    expect(await jobs.run()).toBe(0); // idempotent
    const toAdmin = await prisma.notification.findMany({
      where: { recipientId: adminId, eventKey: 'license.expiring' },
    });
    expect(toAdmin.map((n) => n.title)).toEqual(
      expect.arrayContaining([expect.stringContaining('رخصة فال للمنشأة تنتهي خلال')]),
    );
    const toAgent = await prisma.notification.findMany({
      where: { recipientId: agentId, eventKey: 'license.expiring' },
    });
    expect(toAgent).toHaveLength(1);
    expect(toAgent[0]!.title).toContain('MZ-7601');
  });
});
