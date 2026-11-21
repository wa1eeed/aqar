import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { schemaData } from '@manzilah/schema';
import { provisionTenantDefaults } from '../src/modules/platform/tenant-provisioning.js';
import { FEATURE_CATALOG } from '../src/modules/entitlements/feature-catalog.js';

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

async function main(): Promise<void> {
  console.log('بدء البذر…');
  await seedCities();
  await seedPlatform();
  await seedPlatformAdmin();
  await seedDemoTenant();
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
