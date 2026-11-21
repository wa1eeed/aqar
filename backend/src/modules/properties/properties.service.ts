import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { buildSpecsZod, schemaData } from '@manzilah/schema';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { normalizePagination, paginate, type Paginated } from '../../common/pagination.js';
import { uniqueCode } from '../../common/code.js';
import { deriveColumns } from './derive.js';
import { buildPublicPayload, type PayloadContext, type PropertyRow } from './property-payload.js';
import type { AuthUser } from '../auth/auth-user.js';

const CLOSED = schemaData.closedStatuses;

export const savePropertySchema = z.object({
  type: z.string().refine((t) => t in schemaData.types, 'نوع عقار غير معروف'),
  offer: z.enum(['sale', 'rent', 'investment']),
  title: z.string().min(4).max(160),
  description: z.string().min(10),
  cityId: z.string().min(1),
  districtId: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  price: z.number().int().nonnegative(), // هللات
  rentPeriod: z.enum(['yearly', 'monthly', 'daily']).nullable().optional(),
  negotiable: z.boolean().optional(),
  featured: z.boolean().optional(),
  bookingEnabled: z.boolean().optional(),
  showExactLocation: z.boolean().optional(),
  agentId: z.string().optional(),
  specs: z.record(z.unknown()),
});
export type SavePropertyInput = z.infer<typeof savePropertySchema>;

interface Actor {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly access: AccessScopeService,
    private readonly entitlements: EntitlementsService,
    private readonly integrations: IntegrationsService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────────── Admin: create/update ─────────────────
  async create(input: SavePropertyInput, actor: Actor) {
    const tenantId = this.tenant.requireTenantId();
    const data = savePropertySchema.parse(input);
    this.validateSpecs(data);

    const count = await this.prisma.scoped.property.count({ where: { deletedAt: null } });
    await this.entitlements.assertWithinLimit(tenantId, 'properties.max', count);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { code: true } });
    const code = await uniqueCode(tenant?.code ?? 'MZ', (c) =>
      this.prisma.scoped.property.findFirst({ where: { code: c }, select: { id: true } }).then((r) => !!r),
    );

    const derived = deriveColumns({ ...data, price: BigInt(data.price) });
    const agentId = this.resolveAgent(data.agentId, actor.user);

    const created = await this.prisma.scoped.property.create({
      data: {
        tenantId,
        code,
        slug: derived.slug,
        type: data.type,
        offer: data.offer,
        title: data.title,
        description: data.description,
        cityId: data.cityId,
        districtId: data.districtId,
        lat: data.lat,
        lng: data.lng,
        showExactLocation: data.showExactLocation ?? true,
        price: BigInt(data.price),
        rentPeriod: data.rentPeriod ?? null,
        negotiable: data.negotiable ?? false,
        featured: data.featured ?? false,
        bookingEnabled: data.bookingEnabled ?? true,
        annualisedPrice: derived.annualisedPrice,
        pricePerMeter: derived.pricePerMeter,
        area: derived.area,
        bedrooms: derived.bedrooms,
        bathrooms: derived.bathrooms,
        roi: derived.roi,
        specs: data.specs as Prisma.InputJsonValue,
        adLicenseNo: derived.adLicenseNo,
        falLicenseNo: derived.falLicenseNo,
        licenseExpiry: derived.licenseExpiry,
        agentId,
        createdById: actor.user.sub,
      },
    });
    await this.log(actor, 'property.create', created.id, undefined, { code });
    return created;
  }

  async update(id: number, input: SavePropertyInput, actor: Actor) {
    const existing = await this.requireOwned(id, actor.user);
    const data = savePropertySchema.parse(input);
    this.validateSpecs(data);
    const derived = deriveColumns({ ...data, price: BigInt(data.price) });

    const updated = await this.prisma.scoped.property.update({
      where: { id },
      data: {
        type: data.type,
        offer: data.offer,
        title: data.title,
        slug: derived.slug,
        description: data.description,
        cityId: data.cityId,
        districtId: data.districtId,
        lat: data.lat,
        lng: data.lng,
        showExactLocation: data.showExactLocation ?? existing.showExactLocation,
        price: BigInt(data.price),
        rentPeriod: data.rentPeriod ?? null,
        negotiable: data.negotiable ?? false,
        featured: data.featured ?? existing.featured,
        bookingEnabled: data.bookingEnabled ?? existing.bookingEnabled,
        annualisedPrice: derived.annualisedPrice,
        pricePerMeter: derived.pricePerMeter,
        area: derived.area,
        bedrooms: derived.bedrooms,
        bathrooms: derived.bathrooms,
        roi: derived.roi,
        specs: data.specs as Prisma.InputJsonValue,
        adLicenseNo: derived.adLicenseNo,
        falLicenseNo: derived.falLicenseNo,
        licenseExpiry: derived.licenseExpiry,
        agentId: data.agentId ?? existing.agentId,
        updatedById: actor.user.sub,
      },
    });
    await this.log(actor, 'property.update', id);
    return updated;
  }

  async changeStatus(id: number, status: string, reason: string | undefined, actor: Actor) {
    const existing = await this.requireOwned(id, actor.user);
    const allowed = schemaData.statuses[status];
    if (!allowed || !allowed.offers.includes(existing.offer as 'sale')) {
      throw new BadRequestException('حالة غير مسموحة لهذا العرض');
    }
    const updated = await this.prisma.scoped.property.update({ where: { id }, data: { status: status as never } });
    await this.prisma.propertyStatusHistory.create({
      data: {
        tenantId: this.tenant.requireTenantId(),
        propertyId: id,
        from: existing.status as never,
        to: status as never,
        reason: reason ?? 'manual',
        actorType: 'staff',
        actorId: actor.user.sub,
      },
    });
    await this.log(actor, 'property.status', id, { status: existing.status }, { status });
    return updated;
  }

  async publish(id: number, actor: Actor) {
    const existing = await this.requireOwned(id, actor.user);
    // قاعدة النشر: ترخيص الإعلان ورخصة فال مطلوبان (docs/11 Phase 3)
    if (!existing.adLicenseNo || !existing.falLicenseNo) {
      throw new BadRequestException('لا يمكن النشر: رقم ترخيص الإعلان ورخصة فال مطلوبان');
    }
    if (actor.user.role === 'agent' && !actor.user.perms?.includes('properties.publish')) {
      throw new ForbiddenException('لا تملك صلاحية النشر');
    }
    const updated = await this.prisma.scoped.property.update({
      where: { id },
      data: { visibility: 'published', publishedAt: existing.publishedAt ?? new Date() },
    });
    await this.log(actor, 'property.publish', id);
    return updated;
  }

  async unpublish(id: number, actor: Actor) {
    await this.requireOwned(id, actor.user);
    const updated = await this.prisma.scoped.property.update({ where: { id }, data: { visibility: 'draft' } });
    await this.log(actor, 'property.unpublish', id);
    return updated;
  }

  async softDelete(id: number, actor: Actor) {
    await this.requireOwned(id, actor.user);
    await this.prisma.scoped.property.update({ where: { id }, data: { deletedAt: new Date(), visibility: 'archived' } });
    await this.log(actor, 'property.delete', id);
    return { deleted: true };
  }

  // ───────────────── Admin list ─────────────────
  async adminList(query: Record<string, unknown>, user: AuthUser) {
    const scope = this.access.forStaff(user).properties;
    const where = { ...this.buildWhere(query, false), ...scope } as Prisma.PropertyWhereInput;
    return this.page(query, where);
  }

  async adminGet(id: number, user: AuthUser) {
    const p = await this.prisma.scoped.property.findFirst({
      where: { id, ...this.access.forStaff(user).properties },
      include: { media: true, city: true, district: true, agent: true, statusHistory: true },
    });
    if (!p) throw new NotFoundException('العقار غير موجود');
    return p;
  }

  // ───────────────── Public ─────────────────
  async publicList(query: Record<string, unknown>): Promise<Paginated<ReturnType<typeof buildPublicPayload>>> {
    const where = this.buildWhere(query, true);
    const { page, pageSize, items, total } = await this.pageRows(query, where);
    const payloads = await Promise.all(items.map((p) => this.toPayload(p)));
    return paginate(payloads, total, page, pageSize);
  }

  async publicGet(id: number) {
    const p = await this.loadPublic(id);
    // زيادة المشاهدات (بدون debounce هنا؛ يُحسّن لاحقاً)
    await this.prisma.scoped.property.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
    return this.toPayload(p);
  }

  async similar(id: number, limit = 4) {
    const base = await this.loadPublic(id);
    const rows = await this.prisma.scoped.property.findMany({
      where: {
        visibility: 'published',
        deletedAt: null,
        status: { notIn: CLOSED as never[] },
        id: { not: id },
        type: base.type,
      },
      include: { media: true, city: true, district: true, agent: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((p) => this.toPayload(p)));
  }

  async stats() {
    const where: Prisma.PropertyWhereInput = {
      visibility: 'published',
      deletedAt: null,
      status: { notIn: CLOSED as never[] },
    };
    const [total, byType, byOffer, byCity] = await Promise.all([
      this.prisma.scoped.property.count({ where }),
      this.prisma.scoped.property.groupBy({ by: ['type'], where, _count: true }),
      this.prisma.scoped.property.groupBy({ by: ['offer'], where, _count: true }),
      this.prisma.scoped.property.groupBy({ by: ['cityId'], where, _count: true }),
    ]);
    const toMap = (rows: { _count: unknown }[], key: string) =>
      Object.fromEntries(rows.map((r) => [(r as Record<string, unknown>)[key], (r as { _count: number })._count]));
    return { total, byType: toMap(byType, 'type'), byOffer: toMap(byOffer, 'offer'), byCity: toMap(byCity, 'cityId') };
  }

  async nearby(id: number, radius = 2000) {
    const p = await this.loadPublic(id);
    const cats = Object.keys(schemaData.nearby);
    const cached = await this.prisma.nearbyCache.findFirst({
      where: { propertyId: id, provider: 'places.overpass', radius, expiresAt: { gt: new Date() } },
    });
    if (cached) return cached.items;

    const items = await this.integrations.nearby(Number(p.lat), Number(p.lng), radius, cats);
    const cacheDays = 30;
    await this.prisma.nearbyCache.upsert({
      where: { propertyId_provider_radius: { propertyId: id, provider: 'places.overpass', radius } },
      create: {
        tenantId: this.tenant.requireTenantId(),
        propertyId: id,
        provider: 'places.overpass',
        radius,
        items: items as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + cacheDays * 86_400_000),
      },
      update: { items: items as unknown as Prisma.InputJsonValue, fetchedAt: new Date(), expiresAt: new Date(Date.now() + cacheDays * 86_400_000) },
    });
    return items;
  }

  // ───────────────── helpers ─────────────────
  private validateSpecs(data: SavePropertyInput): void {
    const result = buildSpecsZod(data.type, data.offer).safeParse(data.specs);
    if (!result.success) {
      throw new BadRequestException({ message: 'بيانات المواصفات غير صحيحة', errors: result.error.flatten() });
    }
  }

  private resolveAgent(agentId: string | undefined, user: AuthUser): string {
    if (user.role === 'agent') return user.sub; // الوكيل ينشئ باسمه فقط
    return agentId ?? user.sub;
  }

  private async requireOwned(id: number, user: AuthUser) {
    const p = await this.prisma.scoped.property.findFirst({ where: { id, ...this.access.forStaff(user).properties } });
    if (!p) throw new NotFoundException('العقار غير موجود أو لا تملك صلاحيته');
    return p;
  }

  private async loadPublic(id: number) {
    const p = await this.prisma.scoped.property.findFirst({
      where: { id, visibility: 'published', deletedAt: null },
      include: { media: true, city: true, district: true, agent: true },
    });
    if (!p) throw new NotFoundException('العقار غير موجود');
    return p;
  }

  private buildWhere(q: Record<string, unknown>, publicOnly: boolean): Prisma.PropertyWhereInput {
    const str = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
    const num = (k: string) => (q[k] != null && q[k] !== '' ? Number(q[k]) : undefined);
    const csv = (k: string) => (str(k) ? str(k)!.split(',').filter(Boolean) : undefined);
    const and: Prisma.PropertyWhereInput[] = [];
    const where: Prisma.PropertyWhereInput = { deletedAt: null };

    if (publicOnly) where.visibility = 'published';
    if (str('offer')) where.offer = str('offer') as never;
    if (str('city')) where.cityId = str('city');
    if (str('district')) where.district = { nameAr: str('district') };
    const types = csv('types');
    if (types?.length) where.type = { in: types };
    const statuses = csv('status');
    if (statuses?.length) where.status = { in: statuses as never[] };
    if (q.hideClosed === 'true' || q.hideClosed === true) where.status = { notIn: CLOSED as never[] };
    if (str('rentPeriod')) where.rentPeriod = str('rentPeriod') as never;
    if (q.featured === 'true' || q.featured === true) where.featured = true;

    const priceMin = num('priceMin');
    const priceMax = num('priceMax');
    if (priceMin != null || priceMax != null) {
      where.annualisedPrice = {
        ...(priceMin != null ? { gte: BigInt(Math.round(priceMin * 100)) } : {}),
        ...(priceMax != null ? { lte: BigInt(Math.round(priceMax * 100)) } : {}),
      };
    }
    const areaMin = num('areaMin');
    const areaMax = num('areaMax');
    if (areaMin != null || areaMax != null) {
      where.area = { ...(areaMin != null ? { gte: areaMin } : {}), ...(areaMax != null ? { lte: areaMax } : {}) };
    }
    if (num('bedrooms') != null) where.bedrooms = { gte: num('bedrooms') };
    if (num('bathrooms') != null) where.bathrooms = { gte: num('bathrooms') };
    if (num('roiMin') != null) where.roi = { gte: num('roiMin') };

    for (const key of ['furnished', 'landUse', 'facade', 'constructionStatus'] as const) {
      if (str(key)) and.push({ specs: { path: [key], equals: str(key) } });
    }
    const feats = csv('features');
    if (feats?.length) for (const f of feats) and.push({ specs: { path: [f], equals: true } });

    const ids = csv('ids');
    if (ids?.length) where.id = { in: ids.map((n) => Number(n)).filter((n) => !Number.isNaN(n)) };

    const text = str('q')?.trim();
    if (text) {
      and.push({
        OR: [
          { title: { contains: text, mode: 'insensitive' } },
          { description: { contains: text, mode: 'insensitive' } },
          { code: { contains: text, mode: 'insensitive' } },
          { district: { nameAr: { contains: text } } },
        ],
      });
    }

    if (and.length) where.AND = and;
    return where;
  }

  private orderBy(sort: string | undefined): Prisma.PropertyOrderByWithRelationInput {
    switch (sort) {
      case 'price_asc':
        return { annualisedPrice: 'asc' };
      case 'price_desc':
        return { annualisedPrice: 'desc' };
      case 'area_desc':
        return { area: 'desc' };
      case 'roi_desc':
        return { roi: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  private async pageRows(q: Record<string, unknown>, where: Prisma.PropertyWhereInput) {
    const { page, pageSize, skip, take } = normalizePagination(
      q.page ? Number(q.page) : undefined,
      q.pageSize ? Number(q.pageSize) : undefined,
    );
    const [items, total] = await Promise.all([
      this.prisma.scoped.property.findMany({
        where,
        include: { media: true, city: true, district: true, agent: true },
        orderBy: this.orderBy(typeof q.sort === 'string' ? q.sort : undefined),
        skip,
        take,
      }),
      this.prisma.scoped.property.count({ where }),
    ]);
    return { page, pageSize, items, total };
  }

  private async page(q: Record<string, unknown>, where: Prisma.PropertyWhereInput) {
    const { page, pageSize, items, total } = await this.pageRows(q, where);
    return paginate(items, total, page, pageSize);
  }

  private async toPayload(p: Awaited<ReturnType<PropertiesService['loadPublic']>>) {
    const booking = (await this.settings.get('booking')) as {
      enabled: boolean;
      policies: Record<string, PayloadContext['bookingPolicy']>;
    };
    const licensing = (await this.settings.get('licensing')) as { ejarMembership: string };
    const ctx: PayloadContext = {
      cityLabel: p.city?.nameAr ?? p.cityId,
      districtName: p.district?.nameAr ?? '',
      agent: p.agent
        ? {
            id: p.agent.id,
            name: p.agent.name,
            title: p.agent.title,
            phone: p.agent.phone,
            whatsapp: p.agent.whatsapp,
            falLicense: p.agent.falLicense,
          }
        : null,
      media: p.media ?? [],
      bookingPolicy: booking.policies?.[p.offer] ?? null,
      bookingGloballyEnabled: booking.enabled,
      ejarMembership: licensing.ejarMembership ?? '',
    };
    return buildPublicPayload(p as unknown as PropertyRow, ctx);
  }

  private log(actor: Actor, action: string, entityId: number, before?: unknown, after?: unknown) {
    return this.audit.record({
      actorType: 'staff',
      actorId: actor.user.sub,
      action,
      entityType: 'Property',
      entityId: String(entityId),
      before,
      after,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }
}
