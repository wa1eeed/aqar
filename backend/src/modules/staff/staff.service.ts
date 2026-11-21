import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { TokensService } from '../auth/tokens.service.js';

export const createStaffSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  roleId: z.string().min(1),
  title: z.string().max(120).optional(),
  phone: z.string().max(20).optional(),
  whatsapp: z.string().max(20).optional(),
  falLicense: z.string().max(60).optional(),
  showOnWebsite: z.boolean().optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = createStaffSchema.partial().omit({ email: true }).extend({
  isActive: z.boolean().optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

interface Actor {
  id: string;
  role?: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokensService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const tenantId = this.tenant.requireTenantId();
    const users = await this.prisma.staffUser.findMany({
      where: { tenantId, deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.view(u));
  }

  async create(input: CreateStaffInput, actor: Actor) {
    const tenantId = this.tenant.requireTenantId();
    const data = createStaffSchema.parse(input);

    const role = await this.prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
    if (!role) throw new BadRequestException('الدور غير موجود');
    if (role.key === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('لا يمكن إنشاء مالك إلا بواسطة المالك');
    }

    const exists = await this.prisma.staffUser.findUnique({ where: { tenantId_email: { tenantId, email: data.email } } });
    if (exists) throw new ConflictException('البريد مستخدم لموظف آخر');

    // كلمة مرور مؤقّتة؛ يعيّنها الموظف عبر رابط الدعوة
    const passwordHash = await this.password.hash(randomBytes(16).toString('base64url'));
    const user = await this.prisma.staffUser.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        roleId: data.roleId,
        title: data.title,
        phone: data.phone,
        whatsapp: data.whatsapp,
        falLicense: data.falLicense,
        showOnWebsite: data.showOnWebsite ?? true,
        passwordHash,
      },
      include: { role: true },
    });

    const inviteToken = this.tokens.signShortLived({ sub: user.id, tid: tenantId, purpose: 'reset' }, '72h');
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`دعوة موظف ${data.email}: token=${inviteToken}`); // الإرسال عبر Resend في المرحلة 2
    }

    await this.audit.record({
      tenantId,
      actorType: 'staff',
      actorId: actor.id,
      action: 'staff.create',
      entityType: 'StaffUser',
      entityId: user.id,
      after: { email: data.email, roleId: data.roleId },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { user: this.view(user), inviteToken };
  }

  async update(id: string, input: UpdateStaffInput, actor: Actor) {
    const tenantId = this.tenant.requireTenantId();
    const data = updateStaffSchema.parse(input);
    const target = await this.prisma.staffUser.findFirst({ where: { id, tenantId }, include: { role: true } });
    if (!target) throw new NotFoundException('الموظف غير موجود');

    // المدير لا يعدّل المالك (docs/03 §3)
    if (target.role.key === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('لا يمكن تعديل المالك');
    }
    if (data.roleId) {
      const newRole = await this.prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
      if (!newRole) throw new BadRequestException('الدور غير موجود');
      if (newRole.key === 'owner' && actor.role !== 'owner') {
        throw new ForbiddenException('لا يمكن إسناد دور المالك');
      }
    }

    const updated = await this.prisma.staffUser.update({
      where: { id },
      data: {
        name: data.name,
        roleId: data.roleId,
        title: data.title,
        phone: data.phone,
        whatsapp: data.whatsapp,
        falLicense: data.falLicense,
        isActive: data.isActive,
        showOnWebsite: data.showOnWebsite,
      },
      include: { role: true },
    });
    await this.audit.record({
      tenantId,
      actorType: 'staff',
      actorId: actor.id,
      action: 'staff.update',
      entityType: 'StaffUser',
      entityId: id,
      after: data,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return this.view(updated);
  }

  async reset2fa(id: string, actor: Actor) {
    const tenantId = this.tenant.requireTenantId();
    const target = await this.prisma.staffUser.findFirst({ where: { id, tenantId }, include: { role: true } });
    if (!target) throw new NotFoundException('الموظف غير موجود');
    if (target.role.key === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('لا يمكن إعادة ضبط تحقّق المالك');
    }
    await this.prisma.staffUser.update({ where: { id }, data: { totpSecretEnc: null, totpEnabled: false } });
    await this.audit.record({
      tenantId,
      actorType: 'staff',
      actorId: actor.id,
      action: 'staff.reset_2fa',
      entityType: 'StaffUser',
      entityId: id,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { reset: true };
  }

  private view(u: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    whatsapp: string | null;
    title: string | null;
    falLicense: string | null;
    roleId: string;
    role?: { key: string; nameAr: string };
    isActive: boolean;
    showOnWebsite: boolean;
    totpEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      whatsapp: u.whatsapp,
      title: u.title,
      falLicense: u.falLicense,
      roleId: u.roleId,
      role: u.role ? { key: u.role.key, nameAr: u.role.nameAr } : undefined,
      isActive: u.isActive,
      showOnWebsite: u.showOnWebsite,
      totpEnabled: u.totpEnabled,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }
}
