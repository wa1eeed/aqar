import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { PasswordService } from './password.service.js';
import { TokensService } from './tokens.service.js';
import { TotpService } from './totp.service.js';
import type { AuthUser } from './auth-user.js';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

export type PlatformLoginResult =
  | { twoFactorRequired: true; challengeId: string }
  | { accessToken: string; refreshToken: string; user: AuthUser };

interface Challenge {
  sub: string;
  purpose: 'platform_2fa';
}

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokensService,
    private readonly totp: TotpService,
    private readonly encryption: EncryptionService,
  ) {}

  async login(email: string, plain: string, meta: Meta): Promise<PlatformLoginResult> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    if (!(await this.password.verify(admin.passwordHash, plain))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    if (admin.totpEnabled) {
      const challengeId = this.tokens.signShortLived({ sub: admin.id, purpose: 'platform_2fa' }, '5m');
      return { twoFactorRequired: true, challengeId };
    }
    return this.issueSession(admin.id, meta);
  }

  async verify2fa(challengeId: string, code: string, meta: Meta): Promise<PlatformLoginResult> {
    let challenge: Challenge;
    try {
      challenge = this.tokens.verifyShortLived<Challenge>(challengeId);
    } catch {
      throw new UnauthorizedException('انتهت صلاحية طلب التحقّق');
    }
    if (challenge.purpose !== 'platform_2fa') throw new UnauthorizedException('طلب غير صالح');
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: challenge.sub } });
    if (!admin?.totpSecretEnc) throw new UnauthorizedException('التحقّق الثنائي غير مُهيّأ');
    if (!this.totp.verify(code, this.encryption.decrypt(admin.totpSecretEnc))) {
      throw new UnauthorizedException('رمز تحقّق غير صحيح');
    }
    return this.issueSession(admin.id, meta);
  }

  async setup2fa(adminId: string): Promise<{ otpauthUri: string }> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException();
    const secret = this.totp.generateSecret();
    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: { totpSecretEnc: this.encryption.encrypt(secret), totpEnabled: false },
    });
    return { otpauthUri: this.totp.keyUri(`platform:${admin.email}`, secret) };
  }

  async enable2fa(adminId: string, code: string): Promise<{ enabled: true }> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin?.totpSecretEnc) throw new BadRequestException('ابدأ إعداد التحقّق الثنائي أولاً');
    if (!this.totp.verify(code, this.encryption.decrypt(admin.totpSecretEnc))) {
      throw new BadRequestException('رمز تحقّق غير صحيح');
    }
    await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { totpEnabled: true } });
    return { enabled: true };
  }

  async signAccessFor(adminId: string): Promise<string> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive) throw new UnauthorizedException();
    return this.tokens.signAccess({ sub: admin.id, typ: 'platform', tid: null, mustSetup2fa: !admin.totpEnabled });
  }

  async me(adminId: string): Promise<{ sub: string; typ: 'platform'; name: string; email: string; mustSetup2fa: boolean }> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException();
    return { sub: admin.id, typ: 'platform', name: admin.name, email: admin.email, mustSetup2fa: !admin.totpEnabled };
  }

  private async issueSession(
    adminId: string,
    meta: Meta,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException();
    const user: AuthUser = { sub: admin.id, typ: 'platform', tid: null, mustSetup2fa: !admin.totpEnabled };
    const accessToken = this.tokens.signAccess(user);
    const refreshToken = await this.tokens.issueRefresh('platform', admin.id, null, meta);
    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    return { accessToken, refreshToken, user };
  }
}
