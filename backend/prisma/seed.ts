import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { schemaData } from '@manzilah/schema';
import { SYSTEM_ROLES } from '../src/modules/roles/permissions.js';
import { allDefaults, SETTINGS_SECTION_KEYS } from '../src/modules/settings/schemas/index.js';

const prisma = new PrismaClient();

// سجلّ التكاملات (مفاتيح من docs/05 §3 وخطة التنفيذ). كلها معطّلة افتراضياً وتُهيّأ من لوحة التحكم.
const INTEGRATION_REGISTRY: { key: string; category: string }[] = [
  { key: 'maps.osm', category: 'maps' },
  { key: 'maps.google', category: 'maps' },
  { key: 'places.overpass', category: 'places' },
  { key: 'places.google', category: 'places' },
  { key: 'email.resend', category: 'email' },
  { key: 'storage.r2', category: 'storage' },
  { key: 'payments.moyasar', category: 'payments' },
  { key: 'payments.rize', category: 'payments' },
  { key: 'gov.rega', category: 'government' },
  { key: 'gov.ejar', category: 'government' },
  { key: 'gov.nafith', category: 'government' },
  { key: 'identity.nafath', category: 'identity' },
];

async function seedRoles(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, nameAr: role.nameAr, isSystem: true, permissions: role.permissions },
      update: { nameAr: role.nameAr, isSystem: true, permissions: role.permissions },
    });
  }
  console.log(`✓ الأدوار: ${SYSTEM_ROLES.length}`);
}

async function seedLocations(): Promise<void> {
  for (let i = 0; i < schemaData.cities.length; i++) {
    const city = schemaData.cities[i];
    await prisma.city.upsert({
      where: { id: city.id },
      create: { id: city.id, nameAr: city.label, lat: city.center[0], lng: city.center[1], sort: i },
      update: { nameAr: city.label, lat: city.center[0], lng: city.center[1], sort: i },
    });
    for (const districtName of city.districts) {
      const existing = await prisma.district.findFirst({
        where: { cityId: city.id, nameAr: districtName },
      });
      if (!existing) {
        await prisma.district.create({ data: { cityId: city.id, nameAr: districtName } });
      }
    }
  }
  const cityCount = schemaData.cities.length;
  const districtCount = schemaData.cities.reduce((n, c) => n + c.districts.length, 0);
  console.log(`✓ المواقع: ${cityCount} مدينة، ${districtCount} حي`);
}

async function seedSettings(): Promise<void> {
  const defaults = allDefaults();
  for (const key of SETTINGS_SECTION_KEYS) {
    await prisma.settingsSection.upsert({
      where: { key },
      create: { key, value: defaults[key] as object },
      update: {}, // لا نكتب فوق إعدادات محفوظة
    });
  }
  console.log(`✓ الإعدادات: ${SETTINGS_SECTION_KEYS.length} قسم`);
}

async function seedIntegrations(): Promise<void> {
  for (const row of INTEGRATION_REGISTRY) {
    await prisma.integration.upsert({
      where: { key: row.key },
      create: { key: row.key, category: row.category, enabled: false },
      update: { category: row.category },
    });
  }
  console.log(`✓ التكاملات: ${INTEGRATION_REGISTRY.length} مزوّد`);
}

async function seedOwner(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@manzilah.local';
  const name = process.env.SEED_OWNER_NAME ?? 'مالك المنصة';
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!password && process.env.NODE_ENV === 'production') {
    throw new Error('SEED_OWNER_PASSWORD مطلوب في بيئة الإنتاج');
  }
  const effectivePassword = password ?? 'ChangeMe!123';
  const ownerRole = await prisma.role.findUnique({ where: { key: 'owner' } });
  if (!ownerRole) throw new Error('دور المالك غير موجود — شغّل seedRoles أولاً');

  const passwordHash = await argon2.hash(effectivePassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
  });

  await prisma.staffUser.upsert({
    where: { email },
    create: { name, email, passwordHash, roleId: ownerRole.id, title: 'المالك' },
    update: { roleId: ownerRole.id },
  });
  console.log(`✓ المالك: ${email}${password ? '' : ' (كلمة مرور افتراضية — غيّرها فوراً)'}`);
}

async function main(): Promise<void> {
  console.log('بدء البذر…');
  await seedRoles();
  await seedLocations();
  await seedSettings();
  await seedIntegrations();
  await seedOwner();
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
