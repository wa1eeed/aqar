/**
 * Seed (docs/11 "Seed"): idempotent — safe to run on every deploy. Never overwrites edited data.
 *  - system roles + permissions (docs/03)
 *  - cities/districts from packages/schema
 *  - default settings for every section (current brand values from frontend/assets/js/config.js)
 *  - integration registry rows (docs/05 §3)
 *  - SEO defaults (static page meta + FAQ examples for booking/viewing)
 *  - one owner from SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD (never hard-coded)
 * Demo listings for staging are seeded in Phase 3 together with the media pipeline.
 */
import { cities } from '@nx/schema';
import { type Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { SYSTEM_ROLES } from '../common/auth/permissions';
import { INTEGRATION_REGISTRY } from '../modules/integrations/registry';
import { defaultsFor, SETTINGS_KEYS } from '../modules/settings/schemas';

const prisma = new PrismaClient();

/** docs/03 §1: Argon2id, memoryCost 19456, timeCost 2. */
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

function log(msg: string): void {
  console.log(`[seed] ${msg}`);
}

async function seedRoles(): Promise<void> {
  for (const r of SYSTEM_ROLES) {
    // System role permissions are owned by the code (read-only in admin), so they are refreshed.
    await prisma.role.upsert({
      where: { key: r.key },
      create: { key: r.key, nameAr: r.nameAr, isSystem: true, permissions: r.permissions },
      update: { nameAr: r.nameAr, isSystem: true, permissions: r.permissions },
    });
  }
  log(`roles: ${SYSTEM_ROLES.length}`);
}

async function seedLocations(): Promise<void> {
  let districts = 0;
  for (const [i, c] of cities.entries()) {
    await prisma.city.upsert({
      where: { id: c.id },
      create: { id: c.id, nameAr: c.label, lat: c.center[0], lng: c.center[1], sort: i },
      update: {},
    });
    for (const d of c.districts) {
      await prisma.district.upsert({
        where: { cityId_nameAr: { cityId: c.id, nameAr: d } },
        create: { cityId: c.id, nameAr: d },
        update: {},
      });
      districts++;
    }
  }
  log(`cities: ${cities.length}, districts: ${districts}`);
}

async function seedSettings(): Promise<void> {
  const existing = new Set((await prisma.settingsSection.findMany({ select: { key: true } })).map((r) => r.key));
  let created = 0;
  for (const key of SETTINGS_KEYS) {
    if (existing.has(key)) continue;
    await prisma.settingsSection.create({ data: { key, value: defaultsFor(key) as Prisma.InputJsonValue } });
    created++;
  }
  log(`settings sections created: ${created} (existing kept: ${existing.size})`);
}

async function seedIntegrations(): Promise<void> {
  for (const row of INTEGRATION_REGISTRY) {
    await prisma.integration.upsert({
      where: { key: row.key },
      create: {
        key: row.key,
        category: row.category,
        enabled: row.enabled,
        config: row.config as Prisma.InputJsonValue,
      },
      update: { category: row.category },
    });
  }
  log(`integrations: ${INTEGRATION_REGISTRY.length}`);
}

async function seedSeo(): Promise<void> {
  for (const key of ['home', 'properties', 'about', 'contact', 'favorites', 'booking']) {
    await prisma.seoPageMeta.upsert({ where: { key }, create: { key, keywords: [], faqIds: [] }, update: {} });
  }
  if ((await prisma.seoFaq.count()) === 0) {
    await prisma.seoFaq.createMany({
      data: [
        {
          question: 'كيف أحجز موعد معاينة لعقار؟',
          answerShort:
            'افتح صفحة العقار واضغط «احجز موعد معاينة»، اختر اليوم والفترة المناسبة، وسيتواصل معك المستشار لتأكيد الموعد.',
          scope: ['home', 'booking'],
          sort: 1,
        },
        {
          question: 'كيف أحجز العقار وأدفع العربون؟',
          answerShort:
            'اضغط «احجز العقار» في صفحة العقار، اختر العربون أو الدفع الكامل، ثم ادفع إلكترونياً أو بالتحويل البنكي مع رفع الإيصال.',
          scope: ['home', 'booking'],
          sort: 2,
        },
        {
          question: 'هل يمكن إلغاء الحجز؟',
          answerShort:
            'يمكنك إلغاء الحجز قبل تأكيده من صفحة «حجوزاتي»، وبعد التأكيد تُطبّق سياسة الإلغاء المنشورة في شروط الحجز.',
          scope: ['booking'],
          sort: 3,
        },
      ],
    });
  }
  log('seo defaults ok');
}

async function seedOwner(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    log('owner: skipped (SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD not set)');
    return;
  }
  if (password.length < 12) throw new Error('SEED_OWNER_PASSWORD must be at least 12 characters');
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'owner' } });
  const exists = await prisma.staffUser.findFirst({ where: { roleId: ownerRole.id, deletedAt: null } });
  if (exists) {
    log('owner: exists, unchanged');
    return;
  }
  // lastLoginAt = null marks "first login": password change + 2FA setup are forced (docs/03 §4, Phase 1).
  await prisma.staffUser.create({
    data: {
      name: 'مالك المنشأة',
      email,
      passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      roleId: ownerRole.id,
      showOnWebsite: false,
    },
  });
  log(`owner: created (${email.replace(/^(.).*(@.*)$/, '$1***$2')})`);
}

async function main(): Promise<void> {
  await seedRoles();
  await seedLocations();
  await seedSettings();
  await seedIntegrations();
  await seedSeo();
  await seedOwner();
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
