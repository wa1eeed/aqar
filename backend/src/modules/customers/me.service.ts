import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';

export const savedSearchSchema = z.object({
  name: z.string().min(1).max(80),
  query: z.record(z.unknown()),
  alertEnabled: z.boolean().optional(),
});

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async favorites(customerId: string) {
    const rows = await this.prisma.scoped.favorite.findMany({ where: { customerId }, select: { propertyId: true } });
    return rows.map((r) => r.propertyId);
  }

  async addFavorite(customerId: string, propertyId: number) {
    const tenantId = this.tenant.requireTenantId();
    await this.prisma.scoped.favorite.upsert({
      where: { customerId_propertyId: { customerId, propertyId } },
      create: { tenantId, customerId, propertyId },
      update: {},
    });
    return { ok: true };
  }

  async removeFavorite(customerId: string, propertyId: number) {
    await this.prisma.scoped.favorite
      .delete({ where: { customerId_propertyId: { customerId, propertyId } } })
      .catch(() => undefined);
    return { ok: true };
  }

  savedSearches(customerId: string) {
    return this.prisma.scoped.savedSearch.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } });
  }

  async createSavedSearch(customerId: string, input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const data = savedSearchSchema.parse(input);
    return this.prisma.scoped.savedSearch.create({
      data: {
        tenantId,
        customerId,
        name: data.name,
        query: data.query as Prisma.InputJsonValue,
        alertEnabled: data.alertEnabled ?? true,
      },
    });
  }

  async updateSavedSearch(customerId: string, id: string, input: unknown) {
    const data = savedSearchSchema.partial().parse(input);
    await this.prisma.scoped.savedSearch.updateMany({
      where: { id, customerId },
      data: {
        name: data.name,
        query: data.query as Prisma.InputJsonValue | undefined,
        alertEnabled: data.alertEnabled,
      },
    });
    return { ok: true };
  }

  async deleteSavedSearch(customerId: string, id: string) {
    await this.prisma.scoped.savedSearch.deleteMany({ where: { id, customerId } });
    return { ok: true };
  }
}
