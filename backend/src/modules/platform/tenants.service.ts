import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { RESERVED_SLUGS } from '../../common/tenant/tenant-resolver.middleware.js';
import { provisionTenantDefaults } from './tenant-provisioning.js';

export const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug بأحرف لاتينية صغيرة وأرقام وشرطات فقط'),
  code: z
    .string()
    .min(2)
    .max(6)
    .regex(/^[A-Z0-9]+$/, 'code بأحرف لاتينية كبيرة وأرقام فقط'),
  ownerName: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).optional(),
  planKey: z.string().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } }, domains: true },
    });
  }

  async get(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: { subscription: { include: { plan: true } }, domains: true },
    });
    if (!tenant) throw new NotFoundException('المشترك غير موجود');
    return tenant;
  }

  async create(input: CreateTenantInput, actorId?: string | null) {
    const data = createTenantSchema.parse(input);
    if (RESERVED_SLUGS.has(data.slug)) throw new BadRequestException('هذا الـ slug محجوز');

    const clash = await this.prisma.tenant.findFirst({
      where: { OR: [{ slug: data.slug }, { code: data.code }] },
      select: { slug: true, code: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.slug === data.slug ? 'الـ slug مستخدم' : 'الـ code مستخدم',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: data.slug,
          code: data.code,
          name: data.name,
          status: 'trial',
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        },
      });
      const prov = await provisionTenantDefaults(tx, tenant.id, {
        name: data.ownerName,
        email: data.ownerEmail,
        password: data.ownerPassword,
      });
      if (data.planKey) {
        const plan = await tx.plan.findUnique({ where: { key: data.planKey } });
        if (plan) {
          await tx.subscription.create({
            data: { tenantId: tenant.id, planId: plan.id, status: 'trialing' },
          });
        }
      }
      return { tenant, tempPassword: prov.tempPassword };
    });

    await this.audit.record({
      tenantId: null,
      actorType: 'platform',
      actorId: actorId ?? null,
      action: 'tenant.create',
      entityType: 'Tenant',
      entityId: result.tenant.id,
      after: { slug: data.slug, code: data.code, name: data.name },
    });

    return result;
  }

  async setStatus(id: string, status: 'pending' | 'trial' | 'active' | 'suspended' | 'cancelled', actorId?: string | null) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) throw new NotFoundException('المشترك غير موجود');
    const updated = await this.prisma.tenant.update({ where: { id }, data: { status } });
    await this.audit.record({
      tenantId: null,
      actorType: 'platform',
      actorId: actorId ?? null,
      action: 'tenant.status',
      entityType: 'Tenant',
      entityId: id,
      before: { status: tenant.status },
      after: { status },
    });
    return updated;
  }
}
