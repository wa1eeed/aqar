import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { ALL_PERMISSIONS } from './permissions.js';

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export const createRoleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'مفتاح الدور بأحرف لاتينية صغيرة وأرقام وشرطة سفلية'),
  nameAr: z.string().min(2).max(60),
  permissions: z.array(z.string()),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  nameAr: z.string().min(2).max(60).optional(),
  permissions: z.array(z.string()).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

interface Actor {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  list() {
    const tenantId = this.tenant.requireTenantId();
    return this.prisma.role.findMany({ where: { tenantId }, orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] });
  }

  private assertValidPermissions(perms: string[]): void {
    const unknown = perms.filter((p) => !PERMISSION_SET.has(p));
    if (unknown.length) throw new BadRequestException(`صلاحيات غير معروفة: ${unknown.join(', ')}`);
  }

  async create(input: CreateRoleInput, actor: Actor) {
    const tenantId = this.tenant.requireTenantId();
    const data = createRoleSchema.parse(input);
    this.assertValidPermissions(data.permissions);

    const clash = await this.prisma.role.findUnique({ where: { tenantId_key: { tenantId, key: data.key } } });
    if (clash) throw new ConflictException('مفتاح الدور مستخدم');

    const role = await this.prisma.role.create({
      data: { tenantId, key: data.key, nameAr: data.nameAr, permissions: data.permissions, isSystem: false },
    });
    await this.audit.record({
      tenantId,
      actorType: 'staff',
      actorId: actor.id,
      action: 'role.create',
      entityType: 'Role',
      entityId: role.id,
      after: { key: data.key, permissions: data.permissions },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return role;
  }

  async update(id: string, input: UpdateRoleInput, actor: Actor) {
    const tenantId = this.tenant.requireTenantId();
    const data = updateRoleSchema.parse(input);
    const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('الدور غير موجود');

    // الأدوار النظامية: صلاحياتها للقراءة فقط (docs/03 §3)
    if (role.isSystem && data.permissions) {
      throw new ForbiddenException('لا يمكن تعديل صلاحيات دور نظامي');
    }
    if (data.permissions) this.assertValidPermissions(data.permissions);

    const updated = await this.prisma.role.update({
      where: { id },
      data: { nameAr: data.nameAr, permissions: data.permissions },
    });
    await this.audit.record({
      tenantId,
      actorType: 'staff',
      actorId: actor.id,
      action: 'role.update',
      entityType: 'Role',
      entityId: id,
      before: { permissions: role.permissions },
      after: { permissions: updated.permissions },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return updated;
  }
}
