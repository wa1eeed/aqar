import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { normalizePagination, paginate } from '../../common/pagination.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: Record<string, unknown>) {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    const q = typeof query.q === 'string' ? query.q : undefined;
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }];
    const { page, pageSize, skip, take } = normalizePagination(
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    const [items, total] = await Promise.all([
      this.prisma.scoped.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true },
      }),
      this.prisma.scoped.customer.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async get(id: string) {
    const c = await this.prisma.scoped.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { bookings: true, leads: true, viewings: true, favorites: true } },
      },
    });
    if (!c) throw new NotFoundException('العميل غير موجود');
    const { passwordHash: _ph, nationalIdHash: _nh, ...safe } = c as Record<string, unknown> & { passwordHash?: unknown; nationalIdHash?: unknown };
    void _ph;
    void _nh;
    return safe;
  }

  async setStatus(id: string, status: 'active' | 'blocked', actorId: string) {
    const c = await this.prisma.scoped.customer.findFirst({ where: { id } });
    if (!c) throw new NotFoundException('العميل غير موجود');
    const updated = await this.prisma.scoped.customer.update({ where: { id }, data: { status } });
    await this.audit.record({
      tenantId: this.tenant.tenantId,
      actorType: 'staff',
      actorId,
      action: 'customer.status',
      entityType: 'Customer',
      entityId: id,
      before: { status: c.status },
      after: { status },
    });
    return { id: updated.id, status: updated.status };
  }
}
