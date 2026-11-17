import { closedStatuses, fields, OFFER_KEYS, STATUS_KEYS, TYPE_KEYS } from '@nx/schema';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { PrismaService } from '../../prisma/prisma.service';

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .max(500)
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(allowed as unknown as [T, ...T[]])).max(50));

const BOOL_FILTER_KEYS = fields.filter((f) => f.kind === 'bool' && f.filter).map((f) => f.key) as [string, ...string[]];
const selectOptions = (key: string) =>
  Object.keys(fields.find((f) => f.key === key)?.options ?? {}) as [string, ...string[]];
const sar = z.coerce.number().min(0).max(1e12);
const int = z.coerce.number().int().min(0).max(1_000_000);

/** docs/02 §3 — exactly the parameters frontend/assets/js/api.js sends (+ admin extras). */
export const listQuerySchema = z
  .object({
    offer: z.enum(OFFER_KEYS).optional(),
    city: z
      .string()
      .regex(/^[a-z_]{2,40}$/)
      .optional(),
    district: z.string().trim().max(80).optional(),
    types: csv(TYPE_KEYS).optional(),
    status: csv(STATUS_KEYS).optional(),
    hideClosed: z
      .enum(['1', 'true', '0', 'false'])
      .transform((v) => v === '1' || v === 'true')
      .optional(),
    priceMin: sar.optional(),
    priceMax: sar.optional(),
    areaMin: int.optional(),
    areaMax: int.optional(),
    bedrooms: int.optional(),
    bathrooms: int.optional(),
    features: csv(BOOL_FILTER_KEYS).optional(),
    furnished: z.enum(selectOptions('furnished')).optional(),
    landUse: z.enum(selectOptions('landUse')).optional(),
    facade: z.enum(selectOptions('facade')).optional(),
    constructionStatus: z.enum(selectOptions('constructionStatus')).optional(),
    rentPeriod: z.enum(['yearly', 'monthly', 'daily']).optional(),
    roiMin: z.coerce.number().min(0).max(100).optional(),
    featured: z
      .enum(['1', 'true', '0', 'false'])
      .transform((v) => v === '1' || v === 'true')
      .optional(),
    q: z.string().trim().max(100).optional(),
    ids: z
      .string()
      .max(2000)
      .transform((v) =>
        v
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n > 0 && n < 2_147_483_647),
      )
      .pipe(z.array(z.number()).max(100))
      .optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'area_desc', 'roi_desc']).default('newest'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(12),
  })
  .strip();

export type ListQuery = z.infer<typeof listQuerySchema>;

const halalas = (sarValue: number) => BigInt(Math.round(sarValue * 100));

/** Ids matching the text query: full-text (Arabic config) or trigram/ILIKE on title, code, district. */
export async function searchIds(prisma: PrismaService, q: string): Promise<number[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT p."id" FROM "Property" p JOIN "District" d ON d."id" = p."districtId"
    WHERE p."deletedAt" IS NULL AND (
      p."searchVector" @@ plainto_tsquery('arabic', ${q})
      OR p."title" ILIKE ${like} OR p."code" ILIKE ${like} OR d."nameAr" ILIKE ${like}
    )
    LIMIT 2000`);
  return rows.map((r) => r.id);
}

/** Prisma `where` from the list query. `extra` adds visibility/scope conditions. */
export async function buildWhere(
  prisma: PrismaService,
  q: ListQuery,
  extra: Prisma.PropertyWhereInput[] = [],
): Promise<Prisma.PropertyWhereInput> {
  const and: Prisma.PropertyWhereInput[] = [{ deletedAt: null }, ...extra];
  if (q.offer) and.push({ offer: q.offer });
  if (q.city) and.push({ cityId: q.city });
  if (q.district) and.push({ district: { nameAr: q.district } });
  if (q.types?.length) and.push({ type: { in: q.types } });
  if (q.status?.length) and.push({ status: { in: q.status } });
  if (q.hideClosed) and.push({ status: { notIn: closedStatuses } });
  // Rent prices compare on the annualised value (docs/02 §3); for sale/investment it equals the price.
  if (q.priceMin !== undefined) and.push({ annualisedPrice: { gte: halalas(q.priceMin) } });
  if (q.priceMax !== undefined) and.push({ annualisedPrice: { lte: halalas(q.priceMax) } });
  if (q.areaMin !== undefined) and.push({ area: { gte: q.areaMin } });
  if (q.areaMax !== undefined) and.push({ area: { lte: q.areaMax } });
  if (q.bedrooms) and.push({ bedrooms: { gte: q.bedrooms } });
  if (q.bathrooms) and.push({ bathrooms: { gte: q.bathrooms } });
  for (const f of q.features ?? []) and.push({ specs: { path: [f], equals: true } });
  for (const key of ['furnished', 'landUse', 'facade', 'constructionStatus'] as const) {
    if (q[key]) and.push({ specs: { path: [key], equals: q[key] } });
  }
  if (q.rentPeriod) and.push({ rentPeriod: q.rentPeriod });
  if (q.roiMin !== undefined) and.push({ roi: { gte: q.roiMin } });
  if (q.featured) and.push({ featured: true });
  if (q.ids) and.push({ id: { in: q.ids } });
  if (q.q) and.push({ id: { in: await searchIds(prisma, q.q) } });
  return { AND: and };
}

export function orderBy(sort: ListQuery['sort']): Prisma.PropertyOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ annualisedPrice: 'asc' }, { id: 'desc' }];
    case 'price_desc':
      return [{ annualisedPrice: 'desc' }, { id: 'desc' }];
    case 'area_desc':
      return [{ area: 'desc' }, { id: 'desc' }];
    case 'roi_desc':
      return [{ roi: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

/**
 * Paged list with closed statuses always last (docs/02 §3): open listings first, then closed ones,
 * each in the requested order, paginated across both groups.
 */
export async function pagedIds(
  prisma: PrismaService,
  where: Prisma.PropertyWhereInput,
  sort: ListQuery['sort'],
  page: number,
  pageSize: number,
): Promise<{ ids: number[]; total: number }> {
  const openWhere: Prisma.PropertyWhereInput = { AND: [where, { status: { notIn: closedStatuses } }] };
  const closedWhere: Prisma.PropertyWhereInput = { AND: [where, { status: { in: closedStatuses } }] };
  const [openCount, closedCount] = await Promise.all([
    prisma.property.count({ where: openWhere }),
    prisma.property.count({ where: closedWhere }),
  ]);
  const skip = (page - 1) * pageSize;
  const ids: number[] = [];
  if (skip < openCount) {
    const rows = await prisma.property.findMany({
      where: openWhere,
      orderBy: orderBy(sort),
      skip,
      take: pageSize,
      select: { id: true },
    });
    ids.push(...rows.map((r) => r.id));
  }
  const remaining = pageSize - ids.length;
  if (remaining > 0) {
    const closedSkip = Math.max(0, skip - openCount);
    const rows = await prisma.property.findMany({
      where: closedWhere,
      orderBy: orderBy(sort),
      skip: closedSkip,
      take: remaining,
      select: { id: true },
    });
    ids.push(...rows.map((r) => r.id));
  }
  return { ids, total: openCount + closedCount };
}

export { STATUS_KEYS };
