import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { schemaData } from '@manzilah/schema';
import { provisionTenantDefaults } from '../src/modules/platform/tenant-provisioning.js';
import { FEATURE_CATALOG } from '../src/modules/entitlements/feature-catalog.js';
import { deriveColumns } from '../src/modules/properties/derive.js';

// يُشغَّل من مجلّد backend (pnpm db:seed)؛ الواجهة في ../frontend.
const FRONTEND_DATA = resolve(process.cwd(), '../frontend/data/properties.js');

const prisma = new PrismaClient();

// قيمة JSON لاستحقاق (null = بلا حدّ → Prisma.JsonNull).
function jsonValue(v: boolean | number | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v === null ? Prisma.JsonNull : v;
}

// تكاملات المنصّة (مشتركة للجميع): التخزين والبريد البنيوي والخرائط المجانية.
const PLATFORM_INTEGRATIONS: { key: string; category: string }[] = [
  { key: 'storage.r2', category: 'storage' },
  { key: 'email.resend', category: 'email' },
  { key: 'maps.osm', category: 'maps' },
  { key: 'places.overpass', category: 'places' },
];

const PLANS: { key: string; nameAr: string; priceMonthly: bigint; sort: number }[] = [
  { key: 'trial', nameAr: 'تجريبي', priceMonthly: 0n, sort: 0 },
  { key: 'basic', nameAr: 'أساسي', priceMonthly: 29900n, sort: 1 },
  { key: 'pro', nameAr: 'احترافي', priceMonthly: 99900n, sort: 2 },
];

// استحقاقات كل باقة (طبقة Entitlements). null في الحدّ = بلا حدّ.
const PLAN_ENTITLEMENTS: Record<string, Record<string, boolean | number | null>> = {
  trial: {
    'properties.max': 10, 'staff.max': 2, 'savedSearches.enabled': true, 'bankTransfer.enabled': true,
    'onlinePayments.enabled': false, 'auctions.enabled': false, 'customDomain.enabled': false,
    'seo.advanced': false, 'api.enabled': false, 'api.calls': 0,
  },
  basic: {
    'properties.max': 100, 'staff.max': 5, 'savedSearches.enabled': true, 'bankTransfer.enabled': true,
    'onlinePayments.enabled': true, 'auctions.enabled': false, 'customDomain.enabled': false,
    'seo.advanced': false, 'api.enabled': false, 'api.calls': 0,
  },
  pro: {
    'properties.max': null, 'staff.max': 20, 'savedSearches.enabled': true, 'bankTransfer.enabled': true,
    'onlinePayments.enabled': true, 'auctions.enabled': true, 'customDomain.enabled': true,
    'seo.advanced': true, 'api.enabled': true, 'api.calls': 50000,
  },
};

async function seedCities(): Promise<void> {
  for (let i = 0; i < schemaData.cities.length; i++) {
    const city = schemaData.cities[i];
    await prisma.city.upsert({
      where: { id: city.id },
      create: { id: city.id, nameAr: city.label, lat: city.center[0], lng: city.center[1], sort: i },
      update: { nameAr: city.label, lat: city.center[0], lng: city.center[1], sort: i },
    });
    for (const districtName of city.districts) {
      const existing = await prisma.district.findFirst({ where: { cityId: city.id, nameAr: districtName } });
      if (!existing) await prisma.district.create({ data: { cityId: city.id, nameAr: districtName } });
    }
  }
  const districts = schemaData.cities.reduce((n, c) => n + c.districts.length, 0);
  console.log(`✓ المرجعية: ${schemaData.cities.length} مدينة، ${districts} حي`);
}

async function seedPlatform(): Promise<void> {
  for (const row of PLATFORM_INTEGRATIONS) {
    await prisma.platformIntegration.upsert({
      where: { key: row.key },
      create: { key: row.key, category: row.category, enabled: false },
      update: { category: row.category },
    });
  }

  // سجلّ الميزات (Feature Catalog) من الكود
  for (let i = 0; i < FEATURE_CATALOG.length; i++) {
    const f = FEATURE_CATALOG[i];
    await prisma.feature.upsert({
      where: { key: f.key },
      create: { key: f.key, nameAr: f.nameAr, type: f.type, category: f.category, sort: i },
      update: { nameAr: f.nameAr, type: f.type, category: f.category, sort: i },
    });
  }

  // الباقات واستحقاقاتها
  for (const plan of PLANS) {
    const row = await prisma.plan.upsert({
      where: { key: plan.key },
      create: plan,
      update: { nameAr: plan.nameAr, priceMonthly: plan.priceMonthly, sort: plan.sort },
    });
    const ents = PLAN_ENTITLEMENTS[plan.key] ?? {};
    for (const [featureKey, value] of Object.entries(ents)) {
      await prisma.planEntitlement.upsert({
        where: { planId_featureKey: { planId: row.id, featureKey } },
        create: { planId: row.id, featureKey, value: jsonValue(value) },
        update: { value: jsonValue(value) },
      });
    }
  }
  console.log(`✓ المنصّة: ${PLATFORM_INTEGRATIONS.length} تكامل، ${FEATURE_CATALOG.length} ميزة، ${PLANS.length} خطة`);
}

async function seedPlatformAdmin(): Promise<void> {
  const email = process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'superadmin@manzilah.local';
  const name = process.env.SEED_PLATFORM_ADMIN_NAME ?? 'مشغّل المنصّة';
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (!password && process.env.NODE_ENV === 'production') {
    throw new Error('SEED_PLATFORM_ADMIN_PASSWORD مطلوب في بيئة الإنتاج');
  }
  const effective = password ?? 'ChangeMe!123';
  const passwordHash = await argon2.hash(effective, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 });
  await prisma.platformAdmin.upsert({
    where: { email },
    create: { name, email, passwordHash },
    update: {},
  });
  console.log(`✓ السوبر-أدمن: ${email}${password ? '' : ' (كلمة مرور افتراضية — غيّرها فوراً)'}`);
}

async function seedDemoTenant(): Promise<void> {
  const slug = process.env.SEED_TENANT_SLUG ?? 'demo';
  const code = process.env.SEED_TENANT_CODE ?? 'MZ';
  const name = process.env.SEED_TENANT_NAME ?? 'منزلة العقارية';
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@manzilah.local';
  const ownerName = process.env.SEED_OWNER_NAME ?? 'مالك المكتب';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;

  let tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { slug, code, name, status: 'active', ownerName, ownerEmail },
    });
  }
  const prov = await provisionTenantDefaults(prisma, tenant.id, {
    name: ownerName,
    email: ownerEmail,
    password: ownerPassword,
  });
  // اشتراك تجريبي على خطة trial
  const trial = await prisma.plan.findUnique({ where: { key: 'trial' } });
  if (trial) {
    await prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, planId: trial.id, status: 'active' },
      update: {},
    });
  }
  console.log(
    `✓ المشترك التجريبي: ${slug} (code ${code})، المالك ${ownerEmail}` +
      (prov.tempPassword ? ` — كلمة مرور مؤقّتة: ${prov.tempPassword}` : ''),
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// يحمّل بيانات العرض من ملف الواجهة (نفس المصدر) عبر تنفيذه في سياق معزول.
function loadDemo(): { agents: Record<string, any>; properties: any[] } {
  const code = readFileSync(FRONTEND_DATA, 'utf8');
  const sandbox: any = {};
  sandbox.window = sandbox; // window === global فيعمل MZ وwindow.MZ معاً
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { agents: sandbox.MZ.MOCK_AGENTS ?? {}, properties: sandbox.MZ.MOCK_PROPERTIES ?? [] };
}

async function seedDemoProperties(tenantId: string, tenantCode: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') return; // العرض التجريبي لبيئات غير الإنتاج فقط
  const { agents, properties } = loadDemo();

  const agentRole = await prisma.role.findUnique({ where: { tenantId_key: { tenantId, key: 'agent' } } });
  if (!agentRole) return;
  const passwordHash = await argon2.hash('Demo!12345', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 });
  const agentMap: Record<string, string> = {};
  for (const [key, a] of Object.entries(agents)) {
    const email = `${key}@demo.local`;
    const user = await prisma.staffUser.upsert({
      where: { tenantId_email: { tenantId, email } },
      create: { tenantId, name: a.name, email, title: a.role, phone: a.phone, whatsapp: a.whatsapp, falLicense: a.fal, passwordHash, roleId: agentRole.id, showOnWebsite: true },
      update: {},
    });
    agentMap[key] = user.id;
  }

  for (const p of properties) {
    let district = await prisma.district.findFirst({ where: { cityId: p.city, nameAr: p.district } });
    if (!district) district = await prisma.district.create({ data: { cityId: p.city, nameAr: p.district } });
    const price = BigInt(Math.round(p.price * 100));
    const derived = deriveColumns({ title: p.title, type: p.type, offer: p.offer, price, rentPeriod: p.rentPeriod, specs: p.specs });
    const agentId = agentMap[p.agent] ?? Object.values(agentMap)[0];
    await prisma.property.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id, tenantId, code: `${tenantCode}-${p.id}`, slug: derived.slug, type: p.type, offer: p.offer,
        status: p.status, visibility: 'published', featured: !!p.featured, title: p.title, description: p.description,
        cityId: p.city, districtId: district.id, lat: p.lat, lng: p.lng, price, rentPeriod: p.rentPeriod ?? null,
        negotiable: !!p.negotiable, annualisedPrice: derived.annualisedPrice, pricePerMeter: derived.pricePerMeter,
        area: derived.area, bedrooms: derived.bedrooms, bathrooms: derived.bathrooms, roi: derived.roi,
        specs: p.specs as Prisma.InputJsonValue, adLicenseNo: derived.adLicenseNo, falLicenseNo: derived.falLicenseNo,
        licenseExpiry: derived.licenseExpiry, agentId, createdById: agentId,
        publishedAt: new Date(p.createdAt), createdAt: new Date(p.createdAt),
      },
    });
    const have = await prisma.propertyMedia.count({ where: { propertyId: p.id } });
    if (have === 0 && Array.isArray(p.images)) {
      for (let i = 0; i < p.images.length; i++) {
        const k = p.images[i];
        await prisma.propertyMedia.create({
          data: { tenantId, propertyId: p.id, kind: 'photo', variants: { thumb: k, card: k, full: k }, isCover: i === 0, sort: i, status: 'ready' },
        });
      }
    }
  }
  // ضبط تسلسل id بعد أرقام العرض
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Property"','id'), (SELECT COALESCE(MAX(id),1000) FROM "Property"))`,
  );
  console.log(`✓ العرض التجريبي: ${Object.keys(agentMap).length} وكلاء، ${properties.length} عقار`);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main(): Promise<void> {
  console.log('بدء البذر…');
  await seedCities();
  await seedPlatform();
  await seedPlatformAdmin();
  await seedDemoTenant();
  const demo = await prisma.tenant.findUnique({ where: { slug: process.env.SEED_TENANT_SLUG ?? 'demo' } });
  if (demo) await seedDemoProperties(demo.id, demo.code);
  console.log('اكتمل البذر.');
}

main()
  .catch((err) => {
    console.error('فشل البذر:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
