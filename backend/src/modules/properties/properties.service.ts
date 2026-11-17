import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type Property, type PropertyStatus } from '@prisma/client';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import type { CreatePropertyDto, UpdatePropertyDto } from './dto';
import {
  derive,
  isOfferAllowedForType,
  publishProblems,
  PUBLISH_MESSAGES,
  slugify,
  statusAllowed,
  validateSpecs,
} from './property-rules';
import { buildWhere, pagedIds, type ListQuery } from './query';

const notFound = () => new AppException('NOT_FOUND', 404, 'العقار غير موجود');
const forbidden = () => new AppException('FORBIDDEN', 403, 'يمكنك تعديل عقاراتك فقط');

export const PUBLIC_CACHE_VERSION = 'pub:ver';

const ADMIN_INCLUDE = {
  city: true,
  district: true,
  agent: { select: { id: true, name: true, title: true } },
  media: { orderBy: [{ isCover: 'desc' }, { sort: 'asc' }] },
} satisfies Prisma.PropertyInclude;

/** Admin-side property management (docs/07 §3). Every state change is audited. */
@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Public responses are cached by version; any change bumps it (docs/02 §1 caching). */
  async invalidatePublic(): Promise<void> {
    await this.redis.incr(PUBLIC_CACHE_VERSION);
  }

  private async load(id: number): Promise<Property> {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) throw notFound();
    const p = await this.prisma.property.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound();
    return p;
  }

  /** Agents ("own" scope) may only change listings where they are the agent. */
  private assertCanEdit(user: AuthUser, p: Pick<Property, 'agentId'>): void {
    if (user.scope === 'own' && p.agentId !== user.id) throw forbidden();
  }

  private async resolveAgent(user: AuthUser, agentId: string | undefined): Promise<string> {
    if (user.scope === 'own') {
      if (agentId && agentId !== user.id) throw forbidden();
      return user.id;
    }
    const id = agentId ?? user.id;
    const agent = await this.prisma.staffUser.findFirst({ where: { id, isActive: true, deletedAt: null } });
    if (!agent)
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { agentId: 'unknown_agent' },
      });
    return id;
  }

  private async assertLocation(cityId: string, districtId: string): Promise<void> {
    const d = await this.prisma.district.findFirst({
      where: { id: districtId, cityId, isActive: true },
      select: { id: true },
    });
    if (!d)
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { districtId: 'district_not_in_city' },
      });
  }

  private specsOrThrow(type: string, offer: string, specs: unknown, mode: 'draft' | 'publish') {
    if (!isOfferAllowedForType(type, offer)) {
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { offer: 'offer_not_allowed_for_type' },
      });
    }
    const r = validateSpecs(type, offer, specs, mode);
    if (!r.ok) {
      const fields = Object.fromEntries(r.error.issues.map((i) => [`specs.${i.path.join('.') || '_'}`, i.message]));
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', { fields });
    }
    return r.value;
  }

  // ───────────────────────────── queries ─────────────────────────────

  async list(
    user: AuthUser,
    q: ListQuery & {
      visibility?: 'draft' | 'published' | 'archived';
      agentId?: string;
      license?: 'missing' | 'expiring' | 'expired';
    },
  ) {
    const extra: Prisma.PropertyWhereInput[] = [];
    if (q.visibility) extra.push({ visibility: q.visibility });
    if (q.agentId) extra.push({ agentId: q.agentId });
    if (q.license === 'missing') extra.push({ OR: [{ adLicenseNo: '' }, { falLicenseNo: '' }] });
    if (q.license === 'expired') extra.push({ licenseExpiry: { lt: new Date() } });
    if (q.license === 'expiring')
      extra.push({ licenseExpiry: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } });
    const where = await buildWhere(this.prisma, q, extra);
    const { ids, total } = await pagedIds(this.prisma, where, q.sort, q.page, q.pageSize);
    const rows = await this.prisma.property.findMany({ where: { id: { in: ids } }, include: ADMIN_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id)!)
      .filter(Boolean)
      .map((p) => this.adminView(p, user));
    return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) };
  }

  async get(user: AuthUser, id: number) {
    const p = await this.prisma.property.findFirst({ where: { id, deletedAt: null }, include: ADMIN_INCLUDE });
    if (!p) throw notFound();
    return this.adminView(p, user);
  }

  private adminView(p: Prisma.PropertyGetPayload<{ include: typeof ADMIN_INCLUDE }>, user: AuthUser) {
    const problems = publishProblems({
      ...p,
      readyPhotos: p.media.filter((m) => m.kind === 'photo' && m.status === 'ready').length,
    });
    return {
      ...p,
      lat: Number(p.lat),
      lng: Number(p.lng),
      roi: p.roi === null ? null : Number(p.roi),
      price: Number(p.price),
      annualisedPrice: Number(p.annualisedPrice),
      pricePerMeter: p.pricePerMeter === null ? null : Number(p.pricePerMeter),
      canEdit: user.scope !== 'own' || p.agentId === user.id,
      publishProblems: problems.map((k) => ({ code: k, message: PUBLISH_MESSAGES[k] })),
    };
  }

  async history(_user: AuthUser, id: number) {
    await this.load(id);
    const [status, audit] = await Promise.all([
      this.prisma.propertyStatusHistory.findMany({
        where: { propertyId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'property', entityId: String(id) },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, action: true, actorType: true, actorId: true, createdAt: true },
      }),
    ]);
    return { status, audit };
  }

  // ───────────────────────────── mutations ─────────────────────────────

  async create(user: AuthUser, dto: CreatePropertyDto) {
    const specs = this.specsOrThrow(dto.type, dto.offer, dto.specs, 'draft');
    await this.assertLocation(dto.cityId, dto.districtId);
    const agentId = await this.resolveAgent(user, dto.agentId);
    const prefix = (await this.settings.get('general')).listingCodePrefix;
    const price = BigInt(dto.price);
    const d = derive(dto.offer, price, dto.rentPeriod, specs);

    const created = await this.prisma.$transaction(async (tx) => {
      const p = await tx.property.create({
        data: {
          ...this.columns(dto),
          code: `TMP-${randomBytes(8).toString('hex')}`,
          slug: slugify(dto.title),
          specs: specs as Prisma.InputJsonValue,
          price,
          ...d,
          roi: d.roi,
          agentId,
          createdById: user.id,
          visibility: 'draft',
        },
      });
      const withCode = await tx.property.update({ where: { id: p.id }, data: { code: `${prefix}-${p.id}` } });
      await this.audit.record(
        {
          action: 'property.create',
          entityType: 'property',
          entityId: String(p.id),
          after: { title: p.title, type: p.type, offer: p.offer },
        },
        tx,
      );
      return withCode;
    });
    return this.get(user, created.id);
  }

  private columns(dto: Partial<CreatePropertyDto>) {
    const out: Record<string, unknown> = {};
    for (const k of [
      'type',
      'offer',
      'title',
      'description',
      'featured',
      'cityId',
      'districtId',
      'lat',
      'lng',
      'showExactLocation',
      'rentPeriod',
      'negotiable',
      'bookingEnabled',
      'seoTitle',
      'seoDescription',
      'focusKeyword',
      'keywords',
      'noindex',
    ] as const) {
      if (dto[k] !== undefined) out[k] = dto[k];
    }
    if (dto.paymentPolicy !== undefined)
      out.paymentPolicy = dto.paymentPolicy === null ? Prisma.DbNull : (dto.paymentPolicy as Prisma.InputJsonValue);
    return out as Omit<
      Prisma.PropertyUncheckedCreateInput,
      | 'code'
      | 'slug'
      | 'price'
      | 'specs'
      | 'agentId'
      | 'createdById'
      | 'annualisedPrice'
      | 'area'
      | 'adLicenseNo'
      | 'falLicenseNo'
    >;
  }

  async update(user: AuthUser, id: number, dto: UpdatePropertyDto) {
    const before = await this.load(id);
    this.assertCanEdit(user, before);
    const type = dto.type ?? before.type;
    const offer = dto.offer ?? before.offer;
    const rentPeriod = dto.rentPeriod !== undefined ? dto.rentPeriod : before.rentPeriod;
    if ((offer === 'rent') !== (rentPeriod !== null)) {
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { rentPeriod: 'rent_period_mismatch' },
      });
    }
    if (!statusAllowed(offer, before.status)) {
      throw new AppException('VALIDATION_FAILED', 400, 'الحالة الحالية لا تناسب نوع العرض الجديد', {
        fields: { offer: 'status_not_allowed_for_offer' },
      });
    }
    // Published listings must stay complete; drafts may be partial.
    const mode = before.visibility === 'published' ? 'publish' : 'draft';
    const specs = this.specsOrThrow(type, offer, dto.specs ?? before.specs, mode);
    if (dto.cityId || dto.districtId)
      await this.assertLocation(dto.cityId ?? before.cityId, dto.districtId ?? before.districtId);
    const agentId = dto.agentId !== undefined ? await this.resolveAgent(user, dto.agentId) : before.agentId;
    const price = dto.price !== undefined ? BigInt(dto.price) : before.price;
    const d = derive(offer, price, rentPeriod, specs);

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.property.update({
        where: { id },
        data: {
          ...this.columns(dto),
          ...(dto.slug
            ? { slug: slugify(dto.slug) }
            : dto.title && !dto.slug && before.visibility === 'draft'
              ? { slug: slugify(dto.title) }
              : {}),
          specs: specs as Prisma.InputJsonValue,
          price,
          ...d,
          agentId,
          updatedById: user.id,
        },
      });
      await this.audit.record(
        {
          action: 'property.update',
          entityType: 'property',
          entityId: String(id),
          before: { title: before.title, price: before.price, offer: before.offer, agentId: before.agentId },
          after: { title: p.title, price: p.price, offer: p.offer, agentId: p.agentId },
        },
        tx,
      );
      return p;
    });
    this.events.emit('property.changed', { id });
    if (updated.price < before.price && updated.visibility === 'published') {
      this.events.emit('property.price_dropped', {
        propertyId: id,
        from: Number(before.price),
        to: Number(updated.price),
      });
    }
    await this.invalidatePublic();
    return this.get(user, id);
  }

  async changeStatus(user: AuthUser, id: number, status: PropertyStatus, reason?: string) {
    const before = await this.load(id);
    this.assertCanEdit(user, before);
    if (!statusAllowed(before.offer, status)) {
      throw new AppException('VALIDATION_FAILED', 400, 'هذه الحالة غير متاحة لهذا النوع من العروض', {
        fields: { status: 'status_not_allowed_for_offer' },
      });
    }
    if (before.status === status) return this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({ where: { id }, data: { status, updatedById: user.id } });
      await tx.propertyStatusHistory.create({
        data: {
          propertyId: id,
          from: before.status,
          to: status,
          reason: reason ?? 'manual',
          actorType: 'staff',
          actorId: user.id,
        },
      });
      await this.audit.record(
        {
          action: 'property.status',
          entityType: 'property',
          entityId: String(id),
          before: { status: before.status },
          after: { status, reason },
        },
        tx,
      );
    });
    this.events.emit('property.status_changed', {
      propertyId: id,
      from: before.status,
      to: status,
      agentId: before.agentId,
      actorId: user.id,
    });
    await this.invalidatePublic();
    return this.get(user, id);
  }

  async publish(user: AuthUser, id: number) {
    const p = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: { media: { select: { kind: true, status: true } } },
    });
    if (!p) throw notFound();
    const problems = publishProblems({
      ...p,
      readyPhotos: p.media.filter((m) => m.kind === 'photo' && m.status === 'ready').length,
    });
    if (problems.length) {
      throw new AppException('PUBLISH_BLOCKED', 422, PUBLISH_MESSAGES[problems[0]!], { problems });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: { visibility: 'published', publishedAt: p.publishedAt ?? new Date(), updatedById: user.id },
      });
      await this.audit.record({ action: 'property.publish', entityType: 'property', entityId: String(id) }, tx);
    });
    this.events.emit('property.published', { id });
    await this.invalidatePublic();
    return this.get(user, id);
  }

  async unpublish(user: AuthUser, id: number) {
    await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({ where: { id }, data: { visibility: 'draft', updatedById: user.id } });
      await this.audit.record({ action: 'property.unpublish', entityType: 'property', entityId: String(id) }, tx);
    });
    this.events.emit('property.unpublished', { id });
    await this.invalidatePublic();
    return this.get(user, id);
  }

  async duplicate(user: AuthUser, id: number) {
    const src = await this.load(id);
    this.assertCanEdit(user, src);
    const specs = { ...((src.specs ?? {}) as Record<string, unknown>) };
    // A copy needs its own ad licence (docs/07 §3: licence per listing).
    delete specs.adLicense;
    delete specs.licenseExpiry;
    return this.create(user, {
      type: src.type as CreatePropertyDto['type'],
      offer: src.offer,
      title: `${src.title} (نسخة)`.slice(0, 140),
      description: src.description,
      featured: false,
      agentId: user.scope === 'own' ? user.id : src.agentId,
      cityId: src.cityId,
      districtId: src.districtId,
      lat: Number(src.lat),
      lng: Number(src.lng),
      showExactLocation: src.showExactLocation,
      price: Number(src.price),
      rentPeriod: src.rentPeriod,
      negotiable: src.negotiable,
      specs,
      bookingEnabled: src.bookingEnabled,
      paymentPolicy: (src.paymentPolicy as CreatePropertyDto['paymentPolicy']) ?? null,
      seoTitle: null,
      seoDescription: null,
      focusKeyword: null,
      keywords: [],
      noindex: src.noindex,
    });
  }

  async remove(user: AuthUser, id: number): Promise<void> {
    await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: { deletedAt: new Date(), visibility: 'archived', updatedById: user.id },
      });
      await this.audit.record({ action: 'property.delete', entityType: 'property', entityId: String(id) }, tx);
    });
    await this.invalidatePublic();
  }
}
