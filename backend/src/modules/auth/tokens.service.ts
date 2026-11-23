import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser, SubjectKind } from './auth-user.js';

const ACCESS_TTL = '15m';
const REFRESH_DAYS: Record<SubjectKind, number> = { staff: 14, platform: 14, customer: 30 };

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class TokensService {
  private readonly accessSecret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessSecret = config.get<string>('JWT_ACCESS_SECRET') ?? '';
    if (!this.accessSecret) throw new Error('JWT_ACCESS_SECRET مطلوب لتشغيل المصادقة');
  }

  signAccess(user: AuthUser): string {
    return this.jwt.sign({ ...user }, { secret: this.accessSecret, expiresIn: ACCESS_TTL });
  }

  verifyAccess(token: string): AuthUser {
    return this.jwt.verify<AuthUser>(token, { secret: this.accessSecret });
  }

  /** رمز قصير الأجل لأغراض وسيطة (تحدّي 2FA، إعادة تعيين كلمة المرور). */
  signShortLived(payload: Record<string, unknown>, ttl: string): string {
    return this.jwt.sign(payload, { secret: this.accessSecret, expiresIn: ttl });
  }

  verifyShortLived<T extends object>(token: string): T {
    return this.jwt.verify<T>(token, { secret: this.accessSecret });
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** ينشئ رمز تحديث (opaque) ويخزّن بصمته فقط. */
  async issueRefresh(
    subjectType: SubjectKind,
    subjectId: string,
    tenantId: string | null,
    meta: Meta = {},
    family?: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tenantId: tenantId ?? null,
        subjectType,
        subjectId,
        tokenHash: this.hashToken(raw),
        family: family ?? randomBytes(8).toString('hex'),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        expiresAt: new Date(Date.now() + REFRESH_DAYS[subjectType] * 86_400_000),
      },
    });
    return raw;
  }

  /** يفحص رمز التحديث دون تدويره (لمعرفة حالة الجلسة فقط). */
  async peekRefresh(
    raw: string,
  ): Promise<{ subjectType: SubjectKind; subjectId: string; tenantId: string | null } | null> {
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(raw) } });
    if (!rec || rec.revokedAt || rec.expiresAt < new Date()) return null;
    return { subjectType: rec.subjectType as SubjectKind, subjectId: rec.subjectId, tenantId: rec.tenantId };
  }

  /** يدوّر رمز التحديث: يُبطل القديم ويُصدر جديداً بنفس العائلة. إعادة استخدام رمز مُبطَل تُلغي العائلة كلها. */
  async rotate(
    raw: string,
    meta: Meta = {},
  ): Promise<{ raw: string; subjectType: SubjectKind; subjectId: string; tenantId: string | null }> {
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(raw) } });
    if (!rec) throw new UnauthorizedException('رمز تحديث غير صالح');

    if (rec.revokedAt) {
      await this.revokeFamily(rec.family);
      throw new UnauthorizedException('أُعيد استخدام رمز التحديث — أُبطلت الجلسة لأسباب أمنية');
    }
    if (rec.expiresAt < new Date()) throw new UnauthorizedException('انتهت صلاحية رمز التحديث');

    await this.prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
    const subjectType = rec.subjectType as SubjectKind;
    const newRaw = await this.issueRefresh(subjectType, rec.subjectId, rec.tenantId, meta, rec.family);
    return { raw: newRaw, subjectType, subjectId: rec.subjectId, tenantId: rec.tenantId };
  }

  async revokeByToken(raw: string): Promise<void> {
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(raw) } });
    if (rec) await this.revokeFamily(rec.family);
  }

  /** يُبطل كل جلسات الموضوع (عند إعادة تعيين كلمة المرور). */
  async revokeAllForSubject(subjectType: SubjectKind, subjectId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { subjectType, subjectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
