import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { TokensService } from './tokens.service.js';
import { TotpService } from './totp.service.js';
import type { AuthUser } from './auth-user.js';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

export type StaffLoginResult =
  | { twoFactorRequired: true; challengeId: string }
  | { accessToken: string; refreshToken: string; user: AuthUser };

// شكل /auth/me للموظّف — يطابق عقد لوحة الإدارة (admin lib/types Me).
export interface StaffMe {
  typ: 'staff';
  staff: {
    id: string;
    name: string;
    email: string;
    title: string | null;
    totpEnabled: boolean;
    recoveryCodesLeft: number;
    role: { key: string; nameAr: string };
    mustSetup2fa: boolean;
  };
  permissions: string[];
  scope: 'all' | 'own';
}

interface Challenge {
  sub: string;
  tid: string;
  purpose: '2fa';
}

// أدوار تُلزَم بـ 2FA (docs/03 §1).
const MANDATORY_2FA = new Set(['owner', 'admin', 'finance']);

@Injectable()
export class StaffAuthService {
  private readonly logger = new Logger(StaffAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokensService,
    private readonly totp: TotpService,
    private readonly encryption: EncryptionService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, plain: string, meta: Meta): Promise<StaffLoginResult> {
    const tenantId = this.tenant.requireTenantId();
    const user = await this.prisma.staffUser.findUnique({
      where: { tenantId_email: { tenantId, email } },
      include: { role: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    const ok = await this.password.verify(user.passwordHash, plain);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    if (user.totpEnabled) {
      const challengeId = this.tokens.signShortLived(
        { sub: user.id, tid: tenantId, purpose: '2fa' },
        '5m',
      );
      return { twoFactorRequired: true, challengeId };
    }
    return this.issueSession(user.id, meta);
  }

  async verify2fa(challengeId: string, code: string, meta: Meta): Promise<StaffLoginResult> {
    let challenge: Challenge;
    try {
      challenge = this.tokens.verifyShortLived<Challenge>(challengeId);
    } catch {
      throw new UnauthorizedException('انتهت صلاحية طلب التحقّق، أعد تسجيل الدخول');
    }
    if (challenge.purpose !== '2fa') throw new UnauthorizedException('طلب غير صالح');

    const user = await this.prisma.staffUser.findUnique({ where: { id: challenge.sub } });
    if (!user || !user.totpSecretEnc) throw new UnauthorizedException('التحقّق الثنائي غير مُهيّأ');
    const secret = this.encryption.decrypt(user.totpSecretEnc);
    if (!this.totp.verify(code, secret)) throw new UnauthorizedException('رمز تحقّق غير صحيح');

    return this.issueSession(user.id, meta);
  }

  /** يبدأ إعداد 2FA: يولّد السرّ ويخزّنه مشفّراً (غير مُفعّل بعد) ويعيد otpauth URI. */
  async setup2fa(userId: string): Promise<{ otpauthUri: string }> {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const secret = this.totp.generateSecret();
    await this.prisma.staffUser.update({
      where: { id: userId },
      data: { totpSecretEnc: this.encryption.encrypt(secret), totpEnabled: false },
    });
    return { otpauthUri: this.totp.keyUri(user.email, secret) };
  }

  /** يفعّل 2FA بعد التحقّق من أول رمز. */
  async enable2fa(userId: string, code: string): Promise<{ enabled: true }> {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId } });
    if (!user?.totpSecretEnc) throw new BadRequestException('ابدأ إعداد التحقّق الثنائي أولاً');
    const secret = this.encryption.decrypt(user.totpSecretEnc);
    if (!this.totp.verify(code, secret)) throw new BadRequestException('رمز تحقّق غير صحيح');
    await this.prisma.staffUser.update({ where: { id: userId }, data: { totpEnabled: true } });
    await this.audit.record({
      actorType: 'staff',
      actorId: userId,
      action: 'staff.2fa.enable',
      entityType: 'StaffUser',
      entityId: userId,
    });
    return { enabled: true };
  }

  /** يعيد إصدار رمز وصول فقط (عند تحديث الرمز). */
  async signAccessFor(userId: string): Promise<string> {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user || !user.isActive || user.deletedAt) throw new UnauthorizedException();
    return this.tokens.signAccess({
      sub: user.id,
      typ: 'staff',
      tid: user.tenantId,
      role: user.role.key,
      perms: user.role.permissions,
      mustSetup2fa: MANDATORY_2FA.has(user.role.key) && !user.totpEnabled,
    });
  }

  async me(userId: string): Promise<StaffMe> {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) throw new UnauthorizedException();
    // الوكيل يرى صفوفه فقط؛ بقيّة الأدوار ترى الكلّ (docs/03). التفصيل الدقيق في AccessScopeService.
    const scope: 'all' | 'own' = user.role.key === 'agent' ? 'own' : 'all';
    return {
      typ: 'staff',
      staff: {
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title,
        totpEnabled: user.totpEnabled,
        recoveryCodesLeft: 0,
        role: { key: user.role.key, nameAr: user.role.nameAr },
        mustSetup2fa: MANDATORY_2FA.has(user.role.key) && !user.totpEnabled,
      },
      permissions: user.role.permissions,
      scope,
    };
  }

  /** يرسل رابط إعادة تعيين (بريد في المرحلة 2). لا يكشف وجود الحساب. */
  async forgotPassword(email: string): Promise<void> {
    const tenantId = this.tenant.requireTenantId();
    const user = await this.prisma.staffUser.findUnique({ where: { tenantId_email: { tenantId, email } } });
    if (user && user.isActive && !user.deletedAt) {
      const token = this.tokens.signShortLived({ sub: user.id, tid: tenantId, purpose: 'reset' }, '30m');
      if (process.env.NODE_ENV !== 'production') this.logger.log(`إعادة تعيين ${email}: token=${token}`);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    let payload: { sub: string; tid: string; purpose: string };
    try {
      payload = this.tokens.verifyShortLived<{ sub: string; tid: string; purpose: string }>(token);
    } catch {
      throw new UnauthorizedException('انتهت صلاحية الرابط، اطلب رابطاً جديداً');
    }
    if (payload.purpose !== 'reset') throw new UnauthorizedException('رابط غير صالح');
    const passwordHash = await this.password.hash(newPassword);
    await this.prisma.staffUser.update({ where: { id: payload.sub }, data: { passwordHash } });
    await this.tokens.revokeAllForSubject('staff', payload.sub);
    await this.audit.record({
      tenantId: payload.tid,
      actorType: 'staff',
      actorId: payload.sub,
      action: 'staff.password.reset',
      entityType: 'StaffUser',
      entityId: payload.sub,
    });
  }

  private async issueSession(
    userId: string,
    meta: Meta,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) throw new UnauthorizedException();
    const authUser: AuthUser = {
      sub: user.id,
      typ: 'staff',
      tid: user.tenantId,
      role: user.role.key,
      perms: user.role.permissions,
      mustSetup2fa: MANDATORY_2FA.has(user.role.key) && !user.totpEnabled,
    };
    const accessToken = this.tokens.signAccess(authUser);
    const refreshToken = await this.tokens.issueRefresh('staff', user.id, user.tenantId, meta);
    await this.prisma.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { accessToken, refreshToken, user: authUser };
  }
}
