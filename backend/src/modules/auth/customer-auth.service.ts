import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Customer } from '@prisma/client';
import type Redis from 'ioredis';
import { randomBytes, randomInt } from 'node:crypto';
import { AppException } from '../../common/errors/app-exception';
import { normaliseSaudiMobile } from '../../common/security/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { safeEqual } from '../crypto/encryption.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { AccessTokenService } from './access-token.service';
import type { AuthUser } from './auth.types';
import { KeyedHashService } from './keyed-hash.service';
import { hashPassword, passwordSchema, verifyPassword } from './password';
import { SessionService } from './session.service';
import type { ClientMeta, IssuedSession } from './staff-auth.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const REGISTRATION_TTL_SEC = 15 * 60;

export interface CustomerProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  nafathVerified: boolean;
  marketingConsent: boolean;
  hasPassword: boolean;
}

export type VerifyResult =
  | { done: true; session: IssuedSession; customer: CustomerProfile; isNew: boolean }
  | { done: false; isNew: true; profileRequired: true; registrationToken: string };

const invalidCode = () => new AppException('INVALID_CODE', 401, 'الرمز غير صحيح أو منتهي الصلاحية');

/** Passwordless customer login by email OTP (docs/03 §2). */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly hasher: KeyedHashService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  static profile(c: Customer): CustomerProfile {
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      emailVerified: !!c.emailVerifiedAt,
      phoneVerified: !!c.phoneVerifiedAt,
      nafathVerified: !!c.nafathVerifiedAt,
      marketingConsent: c.marketingConsent,
      hasPassword: !!c.passwordHash,
    };
  }

  private codeHash(destination: string, code: string): string {
    return this.hasher.hash('otp', `login:${destination}:${code}`);
  }

  async sendOtp(channel: 'email' | 'sms', destinationInput: string): Promise<void> {
    if (channel === 'sms') {
      // SMS OTP appears only when an SMS integration is enabled (docs/05, Phase 2).
      throw new AppException('SMS_NOT_AVAILABLE', 422, 'الدخول برسالة نصية غير متاح حالياً، استخدم البريد الإلكتروني');
    }
    const destination = destinationInput.trim().toLowerCase();
    const existing = await this.prisma.customer.findUnique({ where: { email: destination } });
    if (existing && existing.status !== 'active') return; // silently: no enumeration, no code for blocked accounts

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { destination, purpose: 'login', consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          channel: 'email',
          destination,
          purpose: 'login',
          codeHash: this.codeHash(destination, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      }),
    ]);
    const brand = (await this.settings.get('branding')).fullName;
    await this.email.sendTemplate(
      'otp',
      destination,
      { brand, code },
      existing ? { type: 'customer', id: existing.id } : undefined,
    );
  }

  async verifyOtp(
    destinationInput: string,
    code: string,
    profile: { name?: string; phone?: string; consent?: boolean; marketingConsent?: boolean },
    meta: ClientMeta,
  ): Promise<VerifyResult> {
    const destination = destinationInput.trim().toLowerCase();
    const row = await this.prisma.otpCode.findFirst({
      where: { destination, purpose: 'login', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.attempts >= OTP_MAX_ATTEMPTS) throw invalidCode();
    if (!/^\d{6}$/.test(code) || !safeEqual(row.codeHash, this.codeHash(destination, code))) {
      const updated = await this.prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      if (updated.attempts >= OTP_MAX_ATTEMPTS) {
        await this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      }
      throw invalidCode();
    }
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidCode();

    const customer = await this.prisma.customer.findUnique({ where: { email: destination } });
    if (customer) {
      this.assertActive(customer);
      const updated = customer.emailVerifiedAt
        ? customer
        : await this.prisma.customer.update({ where: { id: customer.id }, data: { emailVerifiedAt: new Date() } });
      return {
        done: true,
        isNew: false,
        customer: CustomerAuthService.profile(updated),
        session: await this.login(updated, meta),
      };
    }

    if (profile.name && profile.phone && profile.consent === true) {
      const created = await this.register(destination, profile.name, profile.phone, profile.marketingConsent ?? false);
      return {
        done: true,
        isNew: true,
        customer: CustomerAuthService.profile(created),
        session: await this.login(created, meta),
      };
    }
    const registrationToken = randomBytes(24).toString('base64url');
    await this.redis.set(
      `auth:register:${this.hasher.hash('otp', registrationToken)}`,
      destination,
      'EX',
      REGISTRATION_TTL_SEC,
    );
    return { done: false, isNew: true, profileRequired: true, registrationToken };
  }

  /** Completes a first login after the email was verified (name, Saudi mobile, PDPL consent). */
  async completeRegistration(
    registrationToken: string,
    input: { name: string; phone: string; consent: boolean; marketingConsent?: boolean },
    meta: ClientMeta,
  ): Promise<{ session: IssuedSession; customer: CustomerProfile; isNew: true }> {
    const email = await this.redis.getdel(`auth:register:${this.hasher.hash('otp', registrationToken)}`);
    if (!email) throw new AppException('INVALID_TOKEN', 400, 'انتهت صلاحية التسجيل، أعد طلب الرمز');
    const created = await this.register(email, input.name, input.phone, input.marketingConsent ?? false);
    return { isNew: true, customer: CustomerAuthService.profile(created), session: await this.login(created, meta) };
  }

  private async register(
    email: string,
    name: string,
    phoneInput: string,
    marketingConsent: boolean,
  ): Promise<Customer> {
    const phone = normaliseSaudiMobile(phoneInput);
    if (!phone)
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { phone: 'invalid_phone' },
      });
    if (await this.prisma.customer.findUnique({ where: { phone } })) {
      throw new AppException('PHONE_IN_USE', 409, 'رقم الجوال مسجّل في حساب آخر');
    }
    const now = new Date();
    const customer = await this.prisma.customer.create({
      data: { name: name.trim(), email, phone, emailVerifiedAt: now, consentAt: now, marketingConsent },
    });
    await this.audit.record({
      action: 'customer.register',
      entityType: 'customer',
      entityId: customer.id,
      after: { consentAt: now.toISOString(), marketingConsent },
      actor: { type: 'customer', id: customer.id },
    });
    return customer;
  }

  async passwordLogin(emailInput: string, password: string, meta: ClientMeta) {
    const email = emailInput.trim().toLowerCase();
    const lockKey = `auth:fail:customer:${this.hasher.hash('otp', email)}`;
    if (Number((await this.redis.get(lockKey)) ?? 0) >= 10) {
      throw new AppException('ACCOUNT_LOCKED', 429, 'تم إيقاف الدخول مؤقتاً بسبب محاولات متكررة، حاول بعد 15 دقيقة');
    }
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer?.passwordHash || !(await verifyPassword(customer?.passwordHash, password))) {
      if (!customer?.passwordHash) await verifyPassword(null, password);
      const n = await this.redis.incr(lockKey);
      if (n === 1) await this.redis.expire(lockKey, 15 * 60);
      throw new AppException('INVALID_CREDENTIALS', 401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
    this.assertActive(customer);
    await this.redis.del(lockKey);
    return { customer: CustomerAuthService.profile(customer), session: await this.login(customer, meta), isNew: false };
  }

  async setPassword(user: AuthUser, password: string): Promise<void> {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: user.id } });
    passwordSchema(customer.email ?? undefined).parse(password);
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(password) },
    });
  }

  private assertActive(c: Customer): void {
    if (c.status !== 'active' || c.deletedAt) {
      throw new AppException('ACCOUNT_BLOCKED', 403, 'هذا الحساب غير متاح، تواصل معنا للمساعدة');
    }
  }

  buildAuthUser(c: Customer, sid: string): AuthUser {
    return {
      typ: 'customer',
      id: c.id,
      role: null,
      perms: [],
      scope: 'own',
      authTime: Math.floor(Date.now() / 1000),
      sid,
    };
  }

  private async login(c: Customer, meta: ClientMeta): Promise<IssuedSession> {
    await this.prisma.customer.update({ where: { id: c.id }, data: { lastLoginAt: new Date() } });
    const refresh = await this.sessions.issue('customer', c.id, meta);
    const user = this.buildAuthUser(c, refresh.family);
    const { accessToken, expiresIn } = await this.tokens.sign(user);
    this.events.emit('security.new_login', {
      recipientType: 'customer',
      recipientId: c.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { accessToken, expiresIn, refresh, user };
  }

  async refresh(token: string, meta: ClientMeta): Promise<IssuedSession> {
    const r = await this.sessions.rotate('customer', token, meta);
    if (!r.ok) throw new AppException('SESSION_EXPIRED', 401, 'انتهت الجلسة، سجّل الدخول من جديد');
    const c = await this.prisma.customer.findUnique({ where: { id: r.subjectId } });
    if (!c || c.status !== 'active' || c.deletedAt) {
      await this.sessions.revokeFamily(r.family);
      throw new AppException('SESSION_EXPIRED', 401, 'انتهت الجلسة، سجّل الدخول من جديد');
    }
    const user = this.buildAuthUser(c, r.family);
    const { accessToken, expiresIn } = await this.tokens.sign(user);
    return { accessToken, expiresIn, refresh: { token: r.token, expiresAt: r.expiresAt }, user };
  }
}
