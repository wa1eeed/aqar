/**
 * Demo listings for staging (docs/11 "Seed"): the 26 properties and 3 agents of
 * frontend/data/properties.js, with the same listing numbers (1001…) so existing links and saved
 * favourites keep working. Refuses to run in production. Idempotent.
 *
 * Photos point at the site's own /assets/img files (served by the frontend container), so the
 * demo works before R2 is configured. Real listings upload through the media pipeline.
 */
import { type Prisma, PrismaClient, type PropertyOffer, type PropertyStatus, type RentPeriod } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { hashPassword } from '../modules/auth/password';
import { derive, MONEY_SPEC_KEYS, slugify, validateSpecs } from '../modules/properties/property-rules';

interface MockAgent {
  id: string;
  name: string;
  role: string;
  phone: string;
  whatsapp: string;
  fal: string;
}
interface MockProperty {
  id: number;
  type: string;
  offer: PropertyOffer;
  status: PropertyStatus;
  featured?: boolean;
  title: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  price: number;
  rentPeriod?: RentPeriod;
  negotiable?: boolean;
  agent: string;
  createdAt: string;
  images: string[];
  description: string;
  specs: Record<string, unknown>;
}

function log(msg: string): void {
  console.log(`[seed-demo] ${msg}`);
}

export function loadMock(path?: string): { agents: Record<string, MockAgent>; properties: MockProperty[] } {
  const candidates = [
    path,
    resolve(process.cwd(), 'demo/properties.js'),
    resolve(__dirname, '../../../frontend/data/properties.js'),
    resolve(process.cwd(), '../frontend/data/properties.js'),
  ];
  const file = candidates.find((p) => p && existsSync(p));
  if (!file) throw new Error('frontend/data/properties.js not found (pass --from <path>)');
  // The browser file uses both `window.MZ` and the global `MZ`: make the sandbox its own window.
  const sandbox: {
    window?: unknown;
    MZ?: { MOCK_AGENTS: Record<string, MockAgent>; MOCK_PROPERTIES: MockProperty[] };
  } = {};
  sandbox.window = sandbox;
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { timeout: 1000 });
  if (!sandbox.MZ?.MOCK_PROPERTIES) throw new Error('unexpected data file format');
  return { agents: sandbox.MZ.MOCK_AGENTS, properties: sandbox.MZ.MOCK_PROPERTIES };
}

const assetUrl = (token: string) => (token.includes('.') ? `/assets/img/${token}` : `/assets/img/props/${token}.svg`);

export async function seedDemo(
  prisma: PrismaClient,
  opts: { from?: string; env?: string } = {},
): Promise<{ agents: number; properties: number }> {
  if ((opts.env ?? process.env.NODE_ENV) === 'production') throw new Error('seed-demo never runs in production');
  const { agents, properties } = loadMock(opts.from);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'agent' } });

  const agentIds: Record<string, string> = {};
  for (const [i, a] of Object.values(agents).entries()) {
    const email = `demo.agent${i + 1}@example.com`;
    const existing = await prisma.staffUser.findUnique({ where: { email } });
    agentIds[a.id] =
      existing?.id ??
      (
        await prisma.staffUser.create({
          data: {
            name: a.name,
            email,
            title: a.role,
            phone: a.phone,
            whatsapp: a.whatsapp,
            falLicense: a.fal,
            roleId: role.id,
            // No usable password: demo agents exist to own listings, not to log in.
            passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
          },
        })
      ).id;
  }

  let created = 0;
  for (const p of properties) {
    if (await prisma.property.findUnique({ where: { id: p.id } })) continue;
    const district =
      (await prisma.district.findFirst({ where: { cityId: p.city, nameAr: p.district } })) ??
      (await prisma.district.create({ data: { cityId: p.city, nameAr: p.district } }));
    const specs: Record<string, unknown> = { ...p.specs };
    for (const k of MONEY_SPEC_KEYS)
      if (typeof specs[k] === 'number') specs[k] = Math.round((specs[k] as number) * 100);
    const check = validateSpecs(p.type, p.offer, specs, 'publish');
    if (!check.ok)
      log(
        `property ${p.id}: specs do not fully validate (${check.error.issues[0]?.message} at ${check.error.issues[0]?.path.join('.')}) — seeded anyway`,
      );
    const price = BigInt(Math.round(p.price * 100));
    const d = derive(p.offer, price, p.rentPeriod ?? null, specs);
    const created_at = new Date(`${p.createdAt}T09:00:00Z`);
    const agentId = agentIds[p.agent]!;
    await prisma.property.create({
      data: {
        id: p.id,
        code: `MZ-${p.id}`,
        slug: slugify(p.title),
        type: p.type,
        offer: p.offer,
        status: p.status,
        visibility: 'published',
        featured: !!p.featured,
        title: p.title,
        description: p.description,
        cityId: p.city,
        districtId: district.id,
        lat: p.lat,
        lng: p.lng,
        price,
        rentPeriod: p.rentPeriod ?? null,
        negotiable: !!p.negotiable,
        specs: specs as Prisma.InputJsonValue,
        ...d,
        agentId,
        createdById: agentId,
        publishedAt: created_at,
        createdAt: created_at,
        media: {
          create: p.images.map((token, i) => {
            const url = assetUrl(token);
            return {
              kind: token.includes('.') ? ('photo' as const) : ('floor_plan' as const),
              status: 'ready' as const,
              sort: i,
              isCover: i === 0,
              variants: { thumb: url, card: url, full: url },
            };
          }),
        },
      },
    });
    created++;
  }
  // Explicit ids were inserted: move the sequence past them.
  await prisma.$executeRaw`SELECT setval('"Property_id_seq"', GREATEST((SELECT COALESCE(MAX("id"), 1000) FROM "Property"), 1000))`;
  return { agents: Object.keys(agentIds).length, properties: created };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  const i = process.argv.indexOf('--from');
  seedDemo(prisma, { from: i > 0 ? process.argv[i + 1] : undefined })
    .then((r) => log(`agents: ${r.agents}, properties created: ${r.properties}`))
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
