import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

class LeadsQuery extends createZodDto(
  z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      stage: z.enum(['new', 'contacted', 'viewing', 'negotiation', 'won', 'lost']).optional(),
    })
    .strict(),
) {}

const select = {
  id: true,
  number: true,
  type: true,
  stage: true,
  source: true,
  name: true,
  phone: true,
  email: true,
  propertyId: true,
  assignedToId: true,
  createdAt: true,
} as const;

/**
 * Read-only leads (Phase 1) to establish row-level scoping: agents see only leads assigned to them
 * (docs/03 §3). The full CRM (stages, kanban, activities, routing) arrives in Phase 4.
 */
@ApiTags('admin/leads')
@Controller('admin/leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  @Staff('leads.view')
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: LeadsQuery) {
    const where = { AND: [this.scope.forStaff(user).leads(), q.stage ? { stage: q.stage } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.ceil(total / q.pageSize) };
  }

  @Staff('leads.view')
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    // Out-of-scope leads answer 404, not 403, so their existence is not revealed.
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id }, this.scope.forStaff(user).leads()] },
      select,
    });
    if (!lead) throw new AppException('NOT_FOUND', 404, 'الطلب غير موجود');
    return lead;
  }
}
