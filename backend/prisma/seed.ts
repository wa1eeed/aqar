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
  const name = process.env.SEED_TENANT_NAME ?? 'عقار أونلاين';
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

// ───────────────────────── بيانات العرض الواقعية (عملاء/طلبات/معاينات/حجوزات/مدفوعات) ─────────────────────────

const AR_CUSTOMERS = [
  { name: 'محمد العتيبي', email: 'm.alotaibi@example.com', phone: '0551002030' },
  { name: 'عبدالله الغامدي', email: 'a.alghamdi@example.com', phone: '0552003040' },
  { name: 'سارة القحطاني', email: 's.alqahtani@example.com', phone: '0553004050' },
  { name: 'نورة الدوسري', email: 'n.aldosari@example.com', phone: '0554005060' },
  { name: 'فهد الشهري', email: 'f.alshehri@example.com', phone: '0555006070' },
  { name: 'ريم العنزي', email: 'r.alenezi@example.com', phone: '0556007080' },
  { name: 'خالد الحربي', email: 'k.alharbi@example.com', phone: '0557008090' },
  { name: 'منى السبيعي', email: 'm.alsubaie@example.com', phone: '0558009010' },
  { name: 'يوسف المطيري', email: 'y.almutairi@example.com', phone: '0559001020' },
  { name: 'العنود الزهراني', email: 'a.alzahrani@example.com', phone: '0550102030' },
];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const daysAgo = (d: number): Date => new Date(Date.now() - d * 24 * 3600 * 1000);
const rand6 = (): string => Math.random().toString(36).slice(2, 8).toUpperCase();

async function seedDemoActivity(tenantId: string): Promise<void> {
  if ((await prisma.lead.count({ where: { tenantId } })) > 0) {
    console.log('✓ بيانات العرض موجودة مسبقاً — تخطّي');
    return;
  }
  const agents = await prisma.staffUser.findMany({ where: { tenantId }, select: { id: true } });
  const props = await prisma.property.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, cityId: true, type: true, offer: true, price: true },
  });
  if (!agents.length || !props.length) return;
  const agentId = () => pick(agents).id;

  // العملاء
  const customers = [];
  for (const c of AR_CUSTOMERS) {
    customers.push(
      await prisma.customer.create({
        data: {
          tenantId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          status: 'active',
          marketingConsent: Math.random() > 0.5,
          consentAt: daysAgo(Math.floor(Math.random() * 90)),
          emailVerifiedAt: Math.random() > 0.3 ? daysAgo(Math.floor(Math.random() * 60)) : null,
        },
      }),
    );
  }

  // الطلبات (leads) — أنواع ومراحل ومصادر متنوّعة
  const LEAD_TYPES = ['viewing', 'buy', 'rent', 'invest', 'contact', 'list'] as const;
  const LEAD_STAGES = ['new', 'contacted', 'viewing', 'negotiation', 'won', 'lost'] as const;
  const LEAD_SOURCES = ['website', 'whatsapp', 'phone', 'walk_in'] as const;
  const MESSAGES = [
    'مهتم بمعاينة العقار نهاية الأسبوع.',
    'هل السعر قابل للتفاوض؟',
    'أبحث عن شقة بثلاث غرف في نفس الحي.',
    'أرغب بموعد لزيارة العقار غداً مساءً.',
    'ما هي خيارات التمويل المتاحة؟',
    '',
  ];
  for (let i = 0; i < 16; i++) {
    const cust = Math.random() > 0.35 ? pick(customers) : null;
    const prop = Math.random() > 0.3 ? pick(props) : null;
    const stage = pick([...LEAD_STAGES]);
    const created = daysAgo(Math.floor(Math.random() * 75));
    await prisma.lead.create({
      data: {
        tenantId,
        number: `L-26-${rand6()}`,
        type: pick([...LEAD_TYPES]),
        stage,
        source: pick([...LEAD_SOURCES]),
        propertyId: prop?.id ?? null,
        customerId: cust?.id ?? null,
        cityId: prop?.cityId ?? null,
        name: cust?.name ?? pick(AR_CUSTOMERS).name,
        phone: cust?.phone ?? `05${Math.floor(10000000 + Math.random() * 89999999)}`,
        email: cust?.email ?? null,
        message: pick(MESSAGES) || null,
        budget: Math.random() > 0.5 ? BigInt((500 + Math.floor(Math.random() * 3000)) * 1000 * 100) : null,
        assignedToId: Math.random() > 0.25 ? agentId() : null,
        createdAt: created,
        closedAt: stage === 'won' || stage === 'lost' ? daysAgo(Math.floor(Math.random() * 30)) : null,
        lostReason: stage === 'lost' ? pick(['اختار عقاراً آخر', 'تجاوز الميزانية', 'لم يرد']) : null,
      },
    });
  }

  // المعاينات — ماضية ومستقبلية بحالات مختلفة
  for (let i = 0; i < 8; i++) {
    const prop = pick(props);
    const cust = pick(customers);
    const past = Math.random() > 0.5;
    const status = past ? pick(['completed', 'no_show', 'cancelled'] as const) : pick(['requested', 'confirmed'] as const);
    await prisma.viewing.create({
      data: {
        tenantId,
        propertyId: prop.id,
        customerId: cust.id,
        agentId: agentId(),
        scheduledAt: past ? daysAgo(Math.floor(1 + Math.random() * 20)) : new Date(Date.now() + Math.floor(1 + Math.random() * 10) * 864e5),
        durationMin: pick([30, 45, 60]),
        status,
        notes: status === 'completed' ? pick(['أبدى اهتماماً جادّاً', 'سيعاود التواصل', 'طلب خصماً']) : null,
      },
    });
  }

  // الحجوزات + المدفوعات — تغطّي الحالات الواقعية
  const TERMS = 'v1';
  const deposit = (price: bigint) => BigInt(Math.max(Number(price) / 10, 100000));
  type Scenario = { status: string; pay: string; method: string; type: string; paidFull?: boolean; refunded?: boolean };
  const scenarios: Scenario[] = [
    { status: 'confirmed', pay: 'paid', method: 'moyasar', type: 'deposit' },
    { status: 'completed', pay: 'paid', method: 'moyasar', type: 'full', paidFull: true },
    { status: 'confirmed', pay: 'paid', method: 'bank_transfer', type: 'deposit' },
    { status: 'awaiting_transfer_review', pay: 'under_review', method: 'bank_transfer', type: 'deposit' },
    { status: 'pending_payment', pay: 'pending', method: 'moyasar', type: 'deposit' },
    { status: 'cancelled', pay: 'failed', method: 'moyasar', type: 'deposit' },
    { status: 'refunded', pay: 'refunded', method: 'moyasar', type: 'full', paidFull: true, refunded: true },
  ];
  let bn = 0;
  for (const s of scenarios) {
    const prop = pick(props);
    const cust = pick(customers);
    const amount = s.paidFull ? prop.price : deposit(prop.price);
    const paid = s.pay === 'paid' || s.refunded ? amount : 0n;
    const num = `B-26-${rand6()}`;
    const created = daysAgo(Math.floor(2 + Math.random() * 40));
    const booking = await prisma.booking.create({
      data: {
        tenantId,
        number: num,
        propertyId: prop.id,
        customerId: cust.id,
        offerSnapshot: prop.offer,
        priceSnapshot: prop.price,
        paymentType: s.type as never,
        paymentMethod: s.method as never,
        amountDue: amount,
        amountPaid: paid,
        status: s.status as never,
        holdExpiresAt: new Date(created.getTime() + 2 * 3600 * 1000),
        termsVersion: TERMS,
        termsAcceptedAt: created,
        confirmedAt: ['confirmed', 'completed', 'refunded'].includes(s.status) ? created : null,
        completedAt: s.status === 'completed' ? daysAgo(Math.floor(Math.random() * 10)) : null,
        cancelledAt: s.status === 'cancelled' ? created : null,
        createdAt: created,
      },
    });
    await prisma.payment.create({
      data: {
        tenantId,
        bookingId: booking.id,
        method: s.method as never,
        status: s.pay as never,
        amount,
        refundedAmount: s.refunded ? amount : 0n,
        currency: 'SAR',
        idempotencyKey: `seed-${num}`,
        providerPaymentId: s.method === 'moyasar' ? `pay_${rand6()}` : null,
        receiptNumber: s.pay === 'paid' || s.refunded ? `R-26-${(++bn).toString().padStart(4, '0')}` : null,
        paidAt: s.pay === 'paid' || s.refunded ? created : null,
        createdAt: created,
      },
    });
  }

  console.log(
    `✓ بيانات العرض: ${customers.length} عميل، 16 طلب، 8 معاينات، ${scenarios.length} حجوزات بمدفوعاتها`,
  );
}

async function main(): Promise<void> {
  console.log('بدء البذر…');
  await seedCities();
  await seedPlatform();
  await seedPlatformAdmin();
  await seedDemoTenant();
  const demo = await prisma.tenant.findUnique({ where: { slug: process.env.SEED_TENANT_SLUG ?? 'demo' } });
  if (demo) {
    await seedDemoProperties(demo.id, demo.code);
    await seedDemoActivity(demo.id);
  }
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
