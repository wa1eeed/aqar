import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

class AssigneesQuery extends createZodDto(z.object({ for: z.enum(['leads', 'viewings']) }).strict()) {}

/**
 * Names of staff a lead or viewing can be given to (for pickers). Only id + name are returned, so
 * sales managers can assign without the `staff.manage` permission; agents only see themselves.
 */
@ApiTags('admin/leads')
@Controller('admin/assignees')
export class AssigneesController {
  constructor(private readonly prisma: PrismaService) {}

  @Staff()
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: AssigneesQuery) {
    const perm = q.for === 'leads' ? 'leads.view' : 'viewings.manage';
    const allowed = q.for === 'leads' ? user.perms.includes('leads.view') : user.perms.includes('viewings.manage');
    if (!allowed) throw new AppException('FORBIDDEN', 403, 'لا تملك صلاحية الوصول');
    const items = await this.prisma.staffUser.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { permissions: { has: perm } },
        ...(user.scope === 'own' ? { id: user.id } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return { items };
  }
}
