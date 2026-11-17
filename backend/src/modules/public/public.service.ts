import { ThemeService } from '../theme/theme.service';
import { Inject, Injectable } from '@nestjs/common';
import * as S from '@nx/schema';
import type Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { IntegrationsGateway } from '../integrations/gateway.service';
import { PUBLIC_CACHE_VERSION } from '../properties/properties.service';
import { buildWhere, pagedIds, type ListQuery } from '../properties/query';
import { agentView, PUBLIC_INCLUDE, toPublic, type PublicProperty } from '../properties/serializer';
import { BookingsService } from '../bookings/bookings.service';
import { SettingsService } from '../settings/settings.service';

const PUBLISHED = { visibility: 'published' as const, deletedAt: null };
const CACHE_TTL_SEC = 300;

/** Public read API used by the static frontend (docs/02 §2). */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly gateway: IntegrationsGateway,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly bookings: BookingsService,
    private readonly theme: ThemeService,
  ) {}

  /** Redis cache keyed by the public data version; any property/location change bumps the version. */
  private async cached<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const ver = (await this.redis.get(PUBLIC_CACHE_VERSION)) ?? '0';
    const key = `pub:${ver}:${createHash('sha256').update(name).digest('hex').slice(0, 32)}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await fn();
    await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SEC);
    return value;
  }

  private async serializeOpts() {
    const [licensing, contact] = await Promise.all([this.settings.get('licensing'), this.settings.get('contact')]);
    return {
      ejarMembership: licensing.ejarMembership || undefined,
      contact: { phone: contact.phone, whatsapp: contact.whatsapp },
    };
  }

  async config() {
    const [branding, contact, licensing, maps, booking, features] = await Promise.all([
      this.settings.get('branding'),
      this.settings.get('contact'),
      this.settings.get('licensing'),
      this.settings.get('maps'),
      this.settings.get('booking'),
      this.settings.get('features'),
    ]);
    const map = await this.gateway.maps().publicConfig();
    return {
      brand: {
        name: branding.name,
        fullName: branding.fullName,
        tagline: branding.tagline,
        logoUrl: branding.logoUrl || null,
        logoLightUrl: branding.logoLightUrl || null,
        faviconUrl: branding.faviconUrl || null,
      },
      theme: {
        primary: branding.theme.primary,
        primaryDark: branding.theme.primaryDark,
        accent: branding.theme.accent,
        accentInk: branding.theme.accentInk,
        background: branding.theme.background,
        ink: branding.theme.ink,
        radius: branding.radius,
        fontDisplay: branding.fontDisplay,
        fontBody: branding.fontBody,
        version: (await this.theme.current()).version,
      },
      contact: {
        phone: contact.phone,
        phoneDisplay: contact.phoneDisplay,
        whatsapp: contact.whatsapp,
        email: contact.email,
        address: contact.address,
        hours: contact.hours,
        officeLat: contact.officeLat,
        officeLng: contact.officeLng,
        social: contact.social,
      },
      licensing: {
        regaFalLicense: licensing.regaFalLicense,
        regaVerifyUrl: licensing.regaVerifyUrl,
        showRegaInFooter: licensing.showRegaInFooter,
        ejarMembership: licensing.ejarMembership,
        showEjarInFooter: licensing.showEjarInFooter,
        cr: licensing.crNumber,
        vatNumber: licensing.vatNumber,
        nationalAddress: licensing.nationalAddress,
        showOnPropertyPage: licensing.showOnPropertyPage,
        showEjarOnRentOnly: licensing.showEjarOnRentOnly,
      },
      map: {
        provider: map.provider,
        tilesUrl: map.tilesUrl ?? null,
        attribution: map.attribution ?? null,
        // Only the referrer-restricted browser key, never the server key (docs/02 §2.1).
        googleBrowserKey: map.browserKey ?? null,
        center: maps.defaultCenter,
        zoom: maps.defaultZoom,
      },
      nearby: { radius: maps.nearbyRadius },
      booking: { enabled: booking.enabled && features.booking },
      features: {
        auctions: features.auctions,
        customerAccounts: features.customerAccounts,
        savedSearches: features.savedSearches,
      },
      currency: 'ر.س',
      realtime: { url: '/ws' },
    };
  }

  /** packages/schema merged with the active cities/districts from the DB. */
  schema() {
    return this.cached('schema', async () => {
      const cities = await this.prisma.city.findMany({
        where: { isActive: true },
        orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
        include: { districts: { where: { isActive: true }, orderBy: { nameAr: 'asc' } } },
      });
      return {
        offers: S.offers,
        statuses: S.statuses,
        closedStatuses: S.closedStatuses,
        categories: S.categories,
        types: S.types,
        rentPeriods: S.rentPeriods,
        cities: cities.map((c) => ({
          id: c.id,
          label: c.nameAr,
          center: [Number(c.lat), Number(c.lng)],
          districts: c.districts.map((d) => d.nameAr),
        })),
        fieldGroups: S.fieldGroups,
        fields: S.fields,
        nearby: S.nearby,
      };
    });
  }

  list(q: ListQuery) {
    return this.cached(`list:${JSON.stringify(q)}`, async () => {
      const where = await buildWhere(this.prisma, q, [PUBLISHED]);
      const { ids, total } = await pagedIds(this.prisma, where, q.sort, q.page, q.pageSize);
      const items = await this.byIds(ids);
      return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) };
    });
  }

  private async byIds(ids: number[]): Promise<PublicProperty[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.property.findMany({
      where: { id: { in: ids }, ...PUBLISHED },
      include: PUBLIC_INCLUDE,
    });
    const opts = await this.serializeOpts();
    const byId = new Map(rows.map((r) => [r.id, toPublic(r, opts)]));
    return ids.map((id) => byId.get(id)).filter((p): p is PublicProperty => !!p);
  }

  async get(id: number, clientIp: string | null): Promise<PublicProperty> {
    const p = await this.cached(`property:${id}`, async () => (await this.byIds([id]))[0] ?? null);
    if (!p) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    // One view per visitor per 30 minutes (docs/02 §2); IPs are hashed, never stored raw.
    const who = createHash('sha256')
      .update(clientIp ?? 'unknown')
      .digest('hex')
      .slice(0, 24);
    if ((await this.redis.set(`view:${id}:${who}`, '1', 'EX', 1800, 'NX')) === 'OK') {
      await this.prisma.$executeRaw`UPDATE "Property" SET "viewCount" = "viewCount" + 1 WHERE "id" = ${id}`;
    }
    // Booking availability is computed per request (settings, integrations and active bookings change often).
    const raw = await this.prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        offer: true,
        price: true,
        rentPeriod: true,
        status: true,
        visibility: true,
        bookingEnabled: true,
        deletedAt: true,
        paymentPolicy: true,
      },
    });
    return { ...p, booking: raw ? await this.bookings.publicBlock(raw) : { enabled: false } } as PublicProperty;
  }

  /** Same type first, then offer, then city; never closed listings (docs/02 §2). */
  similar(id: number, limit: number) {
    return this.cached(`similar:${id}:${limit}`, async () => {
      const base = await this.prisma.property.findFirst({
        where: { id, ...PUBLISHED },
        select: { id: true, type: true, offer: true, cityId: true },
      });
      if (!base) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
      const candidates = await this.prisma.property.findMany({
        where: { ...PUBLISHED, id: { not: id }, status: { notIn: S.closedStatuses } },
        select: { id: true, type: true, offer: true, cityId: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
      const score = (x: { type: string; offer: string; cityId: string }) =>
        (x.type === base.type ? 3 : 0) + (x.offer === base.offer ? 2 : 0) + (x.cityId === base.cityId ? 1 : 0);
      const ids = candidates
        .map((c, i) => ({ id: c.id, s: score(c), i }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, limit)
        .map((c) => c.id);
      return this.byIds(ids);
    });
  }

  stats() {
    return this.cached('stats', async () => {
      const where = { ...PUBLISHED, status: { notIn: S.closedStatuses } };
      const [total, byType, byCity, byOffer] = await Promise.all([
        this.prisma.property.count({ where }),
        this.prisma.property.groupBy({ by: ['type'], where, _count: true }),
        this.prisma.property.groupBy({ by: ['cityId'], where, _count: true }),
        this.prisma.property.groupBy({ by: ['offer'], where, _count: true }),
      ]);
      return {
        total,
        byType: Object.fromEntries(byType.map((r) => [r.type, r._count])),
        byCity: Object.fromEntries(byCity.map((r) => [r.cityId, r._count])),
        byOffer: Object.fromEntries(byOffer.map((r) => [r.offer, r._count])),
      };
    });
  }

  async agent(id: string) {
    const a = await this.prisma.staffUser.findFirst({
      where: { id, isActive: true, showOnWebsite: true, deletedAt: null },
    });
    if (!a) throw new AppException('NOT_FOUND', 404, 'المستشار غير موجود');
    return { ...agentView(a), avatarKey: null };
  }
}
