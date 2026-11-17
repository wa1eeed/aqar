import { Injectable } from '@nestjs/common';
import { Prisma, type Role, type StaffUser } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PERMISSIONS } from '../../common/auth/permissions';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { hashPassword } from '../auth/password';
import { SessionService } from '../auth/session.service';
import { StaffAuthService } from '../auth/staff-auth.service';
import type { CreateRoleDto, InviteStaffDto, UpdateRoleDto, UpdateStaffDto } from './dto';

type StaffRow = StaffUser & { role: Role };

const notFound = () => new AppException('NOT_FOUND', 404, 'العضو غير موجود');
const ownerOnly = () => new AppException('FORBIDDEN', 403, 'إدارة حساب المالك متاحة للمالك فقط');

/** Staff & roles management (docs/07 §12, docs/03 §3). Every change is audited. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly auth: StaffAuthService,
  ) {}

  /** Public shape — never password hashes, TOTP secrets or recovery codes. */
  private async view(s: StaffRow) {
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      whatsapp: s.whatsapp,
      title: s.title,
      falLicense: s.falLicense,
      showOnWebsite: s.showOnWebsite,
      isActive: s.isActive,
      totpEnabled: s.totpEnabled,
      lastLoginAt: s.lastLoginAt,
      invitePending: s.lastLoginAt === null && (await this.auth.hasPendingInvite(s.id)),
      role: { id: s.role.id, key: s.role.key, nameAr: s.role.nameAr },
      createdAt: s.createdAt,
    };
  }

  async list() {
    const rows = await this.prisma.staffUser.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return { items: await Promise.all(rows.map((r) => this.view(r))) };
  }

  private async getRow(id: string): Promise<StaffRow> {
    const s = await this.prisma.staffUser.findFirst({ where: { id, deletedAt: null }, include: { role: true } });
    if (!s) throw notFound();
    return s;
  }

  private async getRole(roleId: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role)
      throw new AppException('VALIDATION_FAILED', 400, 'الدور غير موجود', { fields: { roleId: 'unknown_role' } });
    return role;
  }

  /** Only an owner may create, modify or assign the owner role (docs/03: admin "cannot edit owner"). */
  private assertCanTouch(actor: AuthUser, target: { roleKey: string }, newRoleKey?: string): void {
    const touchesOwner = target.roleKey === 'owner' || newRoleKey === 'owner';
    if (touchesOwner && actor.role !== 'owner') throw ownerOnly();
  }

  private async assertNotLastOwner(target: StaffRow, change: { isActive?: boolean; roleKey?: string }): Promise<void> {
    if (target.role.key !== 'owner') return;
    const losesOwner = change.isActive === false || (change.roleKey !== undefined && change.roleKey !== 'owner');
    if (!losesOwner) return;
    const owners = await this.prisma.staffUser.count({
      where: { role: { key: 'owner' }, isActive: true, deletedAt: null },
    });
    if (owners <= 1) throw new AppException('LAST_OWNER', 422, 'لا يمكن إزالة آخر مالك للمنشأة');
  }

  async invite(actor: AuthUser, dto: InviteStaffDto) {
    const role = await this.getRole(dto.roleId);
    this.assertCanTouch(actor, { roleKey: '' }, role.key);
    const emailTaken = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });
    if (emailTaken) throw new AppException('EMAIL_IN_USE', 409, 'البريد الإلكتروني مستخدم لعضو آخر');
    const created = await this.prisma.$transaction(async (tx) => {
      const s = await tx.staffUser.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone || null,
          whatsapp: dto.whatsapp || null,
          title: dto.title || null,
          falLicense: dto.falLicense || null,
          showOnWebsite: dto.showOnWebsite ?? true,
          roleId: role.id,
          // Unusable until the invite is accepted (random, never disclosed).
          passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        },
        include: { role: true },
      });
      await this.audit.record(
        { action: 'staff.invite', entityType: 'staff', entityId: s.id, after: { email: s.email, role: role.key } },
        tx,
      );
      return s;
    });
    await this.auth.createInvite(created);
    return this.view(created);
  }

  async resendInvite(actor: AuthUser, id: string) {
    const s = await this.getRow(id);
    this.assertCanTouch(actor, { roleKey: s.role.key });
    if (s.lastLoginAt) throw new AppException('ALREADY_ACTIVE', 409, 'العضو سجّل الدخول من قبل');
    await this.auth.revokeInvite(s.id);
    await this.auth.createInvite(s);
    await this.audit.record({ action: 'staff.invite_resent', entityType: 'staff', entityId: s.id });
  }

  async update(actor: AuthUser, id: string, dto: UpdateStaffDto) {
    const s = await this.getRow(id);
    if (s.id === actor.id && (dto.roleId !== undefined || dto.isActive !== undefined)) {
      throw new AppException('FORBIDDEN', 403, 'لا يمكنك تغيير دورك أو تعطيل حسابك بنفسك');
    }
    const newRole = dto.roleId ? await this.getRole(dto.roleId) : null;
    this.assertCanTouch(actor, { roleKey: s.role.key }, newRole?.key);
    await this.assertNotLastOwner(s, { isActive: dto.isActive, roleKey: newRole?.key });

    const data: Prisma.StaffUserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp || null;
    if (dto.title !== undefined) data.title = dto.title || null;
    if (dto.falLicense !== undefined) data.falLicense = dto.falLicense || null;
    if (dto.showOnWebsite !== undefined) data.showOnWebsite = dto.showOnWebsite;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (newRole) data.role = { connect: { id: newRole.id } };

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.staffUser.update({ where: { id }, data, include: { role: true } });
      await this.audit.record(
        {
          action: 'staff.update',
          entityType: 'staff',
          entityId: id,
          before: { role: s.role.key, isActive: s.isActive, name: s.name },
          after: { role: u.role.key, isActive: u.isActive, name: u.name },
        },
        tx,
      );
      return u;
    });
    // Role or access changes apply immediately: end the member's sessions.
    if (newRole || dto.isActive === false) {
      await this.sessions.revokeAll('staff', id);
      if (dto.isActive === false) await this.auth.revokeInvite(id);
    }
    return this.view(updated);
  }

  async reset2fa(actor: AuthUser, id: string): Promise<void> {
    const s = await this.getRow(id);
    this.assertCanTouch(actor, { roleKey: s.role.key });
    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id },
        data: { totpEnabled: false, totpSecretEnc: null, totpRecoveryCodes: [] },
      });
      await this.audit.record({ action: 'staff.reset_2fa', entityType: 'staff', entityId: id }, tx);
    });
    await this.sessions.revokeAll('staff', id);
  }

  // ───────────────────────────── roles ─────────────────────────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
    });
    return {
      items: roles.map((r) => ({
        id: r.id,
        key: r.key,
        nameAr: r.nameAr,
        isSystem: r.isSystem,
        permissions: r.permissions,
        members: r._count.users,
      })),
      permissions: PERMISSIONS,
    };
  }

  async createRole(dto: CreateRoleDto) {
    const key = `custom_${randomBytes(4).toString('hex')}`;
    const role = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: { key, nameAr: dto.nameAr, isSystem: false, permissions: [...new Set(dto.permissions)] },
      });
      await this.audit.record(
        {
          action: 'role.create',
          entityType: 'role',
          entityId: r.id,
          after: { nameAr: r.nameAr, permissions: r.permissions },
        },
        tx,
      );
      return r;
    });
    return role;
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new AppException('NOT_FOUND', 404, 'الدور غير موجود');
    if (role.isSystem) throw new AppException('SYSTEM_ROLE', 422, 'أدوار النظام لا يمكن تعديلها');
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.update({
        where: { id },
        data: {
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.permissions !== undefined ? { permissions: [...new Set(dto.permissions)] } : {}),
        },
      });
      await this.audit.record(
        {
          action: 'role.update',
          entityType: 'role',
          entityId: id,
          before: { permissions: role.permissions },
          after: { permissions: r.permissions },
        },
        tx,
      );
      return r;
    });
    // New permissions must not wait 15 minutes: end sessions of members of this role.
    if (dto.permissions) {
      const members = await this.prisma.staffUser.findMany({ where: { roleId: id }, select: { id: true } });
      await Promise.all(members.map((m) => this.sessions.revokeAll('staff', m.id)));
    }
    return updated;
  }
}
