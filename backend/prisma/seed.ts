import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { schemaData } from '@manzilah/schema';
import { provisionTenantDefaults } from '../src/modules/platform/tenant-provisioning.js';

const prisma = new PrismaClient();

// تكاملات المنصّة (مشتركة للجميع): التخزين والبريد البنيوي والخرائط المجانية.
const PLATFORM_INTEGRATIONS: { key: string; category: string }[] = [
  { key: 'storage.r2', category: 'storage' },
  { key: 'email.resend', category: 'email' },
  { key: 'maps.osm', category: 'maps' },
  { key: 'places.overpass', category: 'places' },
];

const PLANS: { key: string; nameAr: string; priceMonthly: bigint; maxListings: number | null; maxStaff: number | null; sort: number }[] = [
  { key: 'trial', nameAr: 'تجريبي', priceMonthly: 0n, maxListings: 10, maxStaff: 2, sort: 0 },
  { key: 'basic', nameAr: 'أساسي', priceMonthly: 29900n, maxListings: 100, maxStaff: 5, sort: 1 },
  { key: 'pro', nameAr: 'احترافي', priceMonthly: 99900n, maxListings: null, maxStaff: null, sort: 2 },
];

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
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      create: plan,
      update: { nameAr: plan.nameAr, priceMonthly: plan.priceMonthly, maxListings: plan.maxListings, maxStaff: plan.maxStaff, sort: plan.sort },
    });
  }
  console.log(`✓ المنصّة: ${PLATFORM_INTEGRATIONS.length} تكامل، ${PLANS.length} خطة`);
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
