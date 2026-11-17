import { Inject, Injectable } from '@nestjs/common';
import { NEARBY_KEYS } from '@nx/schema';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { IntegrationsGateway } from '../integrations/gateway.service';
import type { NearbyItem } from '../integrations/providers/places';
import { SettingsService } from '../settings/settings.service';

/**
 * Nearby services per property (docs/05 §1.5): NearbyCache (30 days, settings.maps.nearbyCacheDays)
 * backed by a short Redis layer, so repeated page views never hit the provider.
 */
@Injectable()
export class NearbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntegrationsGateway,
    private readonly settings: SettingsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async forProperty(
    propertyId: number,
    radiusInput?: number,
  ): Promise<{ source: string; cached: boolean; items: NearbyItem[] }> {
    const maps = await this.settings.get('maps');
    const radius = Math.min(Math.max(radiusInput ?? maps.nearbyRadius, 100), 5000);
    const redisKey = `nearby:${propertyId}:${radius}`;
    const hot = await this.redis.get(redisKey);
    if (hot) return { ...(JSON.parse(hot) as { source: string; items: NearbyItem[] }), cached: true };

    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, visibility: 'published', deletedAt: null },
      select: { id: true, lat: true, lng: true, showExactLocation: true },
    });
    if (!property) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');

    const stored = await this.prisma.nearbyCache.findFirst({
      where: { propertyId, radius, expiresAt: { gt: new Date() } },
      orderBy: { fetchedAt: 'desc' },
    });
    if (stored) {
      const value = { source: stored.provider, items: stored.items as unknown as NearbyItem[] };
      await this.redis.set(redisKey, JSON.stringify(value), 'EX', 3600);
      return { ...value, cached: true };
    }

    const cats = maps.nearbyCategories.filter((c) => (NEARBY_KEYS as readonly string[]).includes(c));
    const result = await this.gateway.places().nearby(Number(property.lat), Number(property.lng), radius, cats);
    if (result.source !== 'none') {
      const expiresAt = new Date(Date.now() + maps.nearbyCacheDays * 86_400_000);
      await this.prisma.nearbyCache.upsert({
        where: { propertyId_provider_radius: { propertyId, provider: result.source, radius } },
        create: {
          propertyId,
          provider: result.source,
          radius,
          items: result.items as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
        update: { items: result.items as unknown as Prisma.InputJsonValue, fetchedAt: new Date(), expiresAt },
      });
      await this.redis.set(redisKey, JSON.stringify(result), 'EX', 3600);
    }
    return { ...result, cached: false };
  }
}
