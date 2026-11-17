import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Role, StaffUser } from '@prisma/client';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';
import { SYSTEM_ROLES } from '../../common/auth/permissions';
import { AppException } from '../../common/errors/app-exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../crypto/encryption.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { AccessTokenService } from './access-token.service';
import type { AuthUser } from './auth.types';
import { KeyedHashService } from './keyed-hash.service';
import { hashPassword, passwordSchema, verifyPassword } from './password';
import { SessionService } from './session.service';
import { generateRecoveryCodes, generateTotpSecret, normaliseRecoveryCode, otpauthUrl, verifyTotp } from './totp';

export type LoginStep = 'totp' | 'password_change' | 'totp_setup';
export type StaffWithRole = StaffUser & { role: Role };

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refresh: { token: string; expiresAt: Date };
  user: AuthUser;
}

export type LoginResult =
  | { done: true; session: IssuedSession }
  | { done: false; next: LoginStep; challengeId: string };

interface Challenge {
  userId: string;
  pending: LoginStep[];
  attempts: number;
  setupSecretEnc?: string; // base64 of encrypted pending TOTP secret
}

const CHALLENGE_TTL_SEC = 10 * 60;
const MAX_CHALLENGE_ATTEMPTS = 5;
const LOCK_THRESHOLD = 10;
const LOCK_WINDOW_SEC = 15 * 60;
const RESET_TTL_MS = 30 * 60 * 1000;
export const INVITE_TTL_SEC = 72 * 3600;

const invalidCredentials = () =>
  new AppException('INVALID_CREDENTIALS', 401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
const invalidChallenge = () =>
  new AppException('CHALLENGE_EXPIRED', 401, 'انتهت صلاحية جلسة الدخول، سجّل الدخول من جديد');

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly hasher: KeyedHashService,
    private readonly crypto: EncryptionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────────────────────────── helpers ─────────────────────────────

  static requires2fa(roleKey: string): boolean {
    return SYSTEM_ROLES.some((r) => r.key === roleKey && r.requires2fa);
  }

  static scopeFor(roleKey: string): 'all' | 'own' {
    return SYSTEM_ROLES.find((r) => r.key === roleKey)?.scope ?? 'all';
  }

  private lockKey(email: string): string {
    return `auth:fail:staff:${this.hasher.hash('otp', email)}`;
  }

  private async assertNotLocked(email: string): Promise<void> {
    const fails = Number((await this.redis.get(this.lockKey(email))) ?? 0);
    if (fails >= LOCK_THRESHOLD) {
      const ttl = await this.redis.ttl(this.lockKey(email));
      throw new AppException('ACCOUNT_LOCKED', 429, 'تم إيقاف الدخول مؤقتاً بسبب محاولات متكررة، حاول بعد 15 دقيقة', {
        retryAfterSec: Math.max(ttl, 1),
      });
    }
  }

  private async recordFailure(email: string): Promise<void> {
    const key = this.lockKey(email);
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, LOCK_WINDOW_SEC);
  }

  private async findActiveByEmail(email: string): Promise<StaffWithRole | null> {
    return this.prisma.staffUser.findFirst({
      where: { email, isActive: true, deletedAt: null },
      include: { role: true },
    });
  }

  private async loadActive(id: string): Promise<StaffWithRole> {
    const user = await this.prisma.staffUser.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw invalidChallenge();
    return user;
  }

  private async saveChallenge(id: string, c: Challenge): Promise<void> {
    await this.redis.set(`auth:challenge:${id}`, JSON.stringify(c), 'EX', CHALLENGE_TTL_SEC);
  }

  private async loadChallenge(id: string, expected: LoginStep): Promise<Challenge> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(id)) throw invalidChallenge();
    const raw = await this.redis.get(`auth:challenge:${id}`);
    if (!raw) throw invalidChallenge();
    const c = JSON.parse(raw) as Challenge;
    if (c.pending[0] !== expected) throw new AppException('WRONG_STEP', 409, 'خطوة الدخول غير متوقعة');
    return c;
  }

  /** Counts a wrong code; too many → the challenge is destroyed and the account lockout advances. */
  private async failChallenge(id: string, c: Challenge, email: string): Promise<never> {
    c.attempts += 1;
    await this.recordFailure(email);
    if (c.attempts >= MAX_CHALLENGE_ATTEMPTS) {
      await this.redis.del(`auth:challenge:${id}`);
      throw new AppException('TOO_MANY_ATTEMPTS', 429, 'محاولات كثيرة غير صحيحة، سجّل الدخول من جديد');
    }
    await this.saveChallenge(id, c);
    throw new AppException('INVALID_CODE', 401, 'الرمز غير صحيح');
  }

  /** Advance to the next step or finish the login. */
  private async advance(id: string, c: Challenge, meta: ClientMeta): Promise<LoginResult> {
    c.pending.shift();
    if (c.pending.length > 0) {
      c.attempts = 0;
      await this.saveChallenge(id, c);
      return { done: false, next: c.pending[0]!, challengeId: id };
    }
    await this.redis.del(`auth:challenge:${id}`);
    const user = await this.loadActive(c.userId);
    return { done: true, session: await this.completeLogin(user, meta) };
  }

  private async completeLogin(user: StaffWithRole, meta: ClientMeta): Promise<IssuedSession> {
    await this.redis.del(this.lockKey(user.email));
    await this.prisma.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await this.issueSession(user, meta, Math.floor(Date.now() / 1000));
    this.events.emit('security.new_login', {
      recipientType: 'staff',
      recipientId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.record({
      action: 'auth.staff.login',
      entityType: 'staff',
      entityId: user.id,
      actor: { type: 'staff', id: user.id },
    });
    return session;
  }

  buildAuthUser(user: StaffWithRole, sid: string, authTime: number): AuthUser {
    return {
      typ: 'staff',
      id: user.id,
      role: user.role.key,
      perms: user.role.permissions,
      scope: StaffAuthService.scopeFor(user.role.key),
      authTime,
      sid,
    };
  }

  async issueSession(user: StaffWithRole, meta: ClientMeta, authTime: number): Promise<IssuedSession> {
    const refresh = await this.sessions.issue('staff', user.id, meta);
    await this.redis.set(`auth:authtime:${refresh.family}`, String(authTime), 'EX', 15 * 24 * 3600);
    const authUser = this.buildAuthUser(user, refresh.family, authTime);
    const { accessToken, expiresIn } = await this.tokens.sign(authUser);
    return { accessToken, expiresIn, refresh, user: authUser };
  }

  /** Refresh rotation for staff (re-reads the role so permission changes apply). */
  async refresh(token: string, meta: ClientMeta): Promise<IssuedSession> {
    const r = await this.sessions.rotate('staff', token, meta);
    if (!r.ok) throw new AppException('SESSION_EXPIRED', 401, 'انتهت الجلسة، سجّل الدخول من جديد');
    const user = await this.prisma.staffUser.findFirst({
      where: { id: r.subjectId, isActive: true, deletedAt: null },
      include: { role: true },
    });
    if (!user) {
      await this.sessions.revokeFamily(r.family);
      throw new AppException('SESSION_EXPIRED', 401, 'انتهت الجلسة، سجّل الدخول من جديد');
    }
    const authTime = Number((await this.redis.get(`auth:authtime:${r.family}`)) ?? 0);
    const authUser = this.buildAuthUser(user, r.family, authTime);
    const { accessToken, expiresIn } = await this.tokens.sign(authUser);
    return { accessToken, expiresIn, refresh: { token: r.token, expiresAt: r.expiresAt }, user: authUser };
  }

  // ───────────────────────────── login flow ─────────────────────────────

  async login(emailInput: string, password: string, meta: ClientMeta): Promise<LoginResult> {
    const email = emailInput.trim().toLowerCase();
    await this.assertNotLocked(email);
    const user = await this.findActiveByEmail(email);
    const ok = await verifyPassword(user?.passwordHash, password);
    if (!user || !ok) {
      await this.recordFailure(email);
      throw invalidCredentials();
    }

    const pending: LoginStep[] = [];
    if (user.totpEnabled) pending.push('totp');
    if (user.mustChangePassword) pending.push('password_change');
    if (!user.totpEnabled && StaffAuthService.requires2fa(user.role.key)) pending.push('totp_setup');

    if (pending.length === 0) return { done: true, session: await this.completeLogin(user, meta) };
    const id = randomBytes(24).toString('base64url');
    await this.saveChallenge(id, { userId: user.id, pending, attempts: 0 });
    return { done: false, next: pending[0]!, challengeId: id };
  }

  async verifySecondFactor(challengeId: string, code: string, meta: ClientMeta): Promise<LoginResult> {
    const c = await this.loadChallenge(challengeId, 'totp');
    const user = await this.loadActive(c.userId);
    if (!(await this.checkSecondFactor(user, code))) return this.failChallenge(challengeId, c, user.email);
    return this.advance(challengeId, c, meta);
  }

  /** TOTP (with replay protection) or a one-time recovery code. */
  private async checkSecondFactor(user: StaffWithRole, code: string): Promise<boolean> {
    if (!user.totpEnabled || !user.totpSecretEnc) return false;
    const clean = code.replace(/\s+/g, '');
    if (/^\d{6}$/.test(clean)) {
      const secret = this.crypto.decrypt(user.totpSecretEnc, `totp:${user.id}`).toString('utf8');
      const step = verifyTotp(secret, clean);
      if (step === null) return false;
      // A code is accepted once: replaying an observed code fails.
      const fresh = await this.redis.set(`auth:totp-used:${user.id}:${step}`, '1', 'EX', 120, 'NX');
      return fresh === 'OK';
    }
    const normalised = normaliseRecoveryCode(clean);
    if (!normalised) return false;
    const hash = this.hasher.hash('recovery-code', normalised);
    if (!user.totpRecoveryCodes.includes(hash)) return false;
    // Consume atomically: only succeeds if the code is still present.
    const updated = await this.prisma.$executeRaw`
      UPDATE "StaffUser" SET "totpRecoveryCodes" = array_remove("totpRecoveryCodes", ${hash})
      WHERE "id" = ${user.id} AND ${hash} = ANY("totpRecoveryCodes")`;
    if (updated !== 1) return false;
    await this.audit.record({
      action: 'auth.staff.recovery_code_used',
      entityType: 'staff',
      entityId: user.id,
      actor: { type: 'staff', id: user.id },
    });
    return true;
  }

  async initialPasswordChange(challengeId: string, newPassword: string, meta: ClientMeta): Promise<LoginResult> {
    const c = await this.loadChallenge(challengeId, 'password_change');
    const user = await this.loadActive(c.userId);
    await this.setPassword(user, newPassword);
    return this.advance(challengeId, c, meta);
  }

  async totpSetupStart(challengeId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const c = await this.loadChallenge(challengeId, 'totp_setup');
    const user = await this.loadActive(c.userId);
    const secret = generateTotpSecret();
    c.setupSecretEnc = this.crypto.encrypt(secret, `totp-setup:${challengeId}`).toString('base64');
    await this.saveChallenge(challengeId, c);
    return this.totpPresentation(user.email, secret);
  }

  private async totpPresentation(email: string, secret: string) {
    const brand = (await this.settings.get('branding')).name;
    const url = otpauthUrl(brand, email, secret);
    const qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
    return { secret, otpauthUrl: url, qrDataUrl };
  }

  async totpSetupConfirm(
    challengeId: string,
    code: string,
    meta: ClientMeta,
  ): Promise<{ recoveryCodes: string[]; result: LoginResult }> {
    const c = await this.loadChallenge(challengeId, 'totp_setup');
    const user = await this.loadActive(c.userId);
    if (!c.setupSecretEnc) throw new AppException('WRONG_STEP', 409, 'ابدأ إعداد التحقق بخطوتين أولاً');
    const secret = this.crypto
      .decrypt(Buffer.from(c.setupSecretEnc, 'base64'), `totp-setup:${challengeId}`)
      .toString('utf8');
    if (verifyTotp(secret, code.trim()) === null) return this.failChallenge(challengeId, c, user.email);
    const recoveryCodes = await this.enableTotp(user, secret);
    return { recoveryCodes, result: await this.advance(challengeId, c, meta) };
  }

  private async enableTotp(user: StaffUser, secret: string): Promise<string[]> {
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        totpSecretEnc: this.crypto.encrypt(secret, `totp:${user.id}`),
        totpRecoveryCodes: recoveryCodes.map((r) => this.hasher.hash('recovery-code', r)),
      },
    });
    await this.audit.record({
      action: 'auth.staff.2fa_enabled',
      entityType: 'staff',
      entityId: user.id,
      actor: { type: 'staff', id: user.id },
    });
    return recoveryCodes;
  }

  // ───────────────────────────── authenticated self-service ─────────────────────────────

  /** Optional 2FA for roles where it is not mandatory (docs/03 §1). */
  async selfTotpStart(user: AuthUser): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const staff = await this.loadActive(user.id);
    if (staff.totpEnabled) throw new AppException('ALREADY_ENABLED', 409, 'التحقق بخطوتين مفعّل بالفعل');
    const secret = generateTotpSecret();
    await this.redis.set(
      `auth:self-totp:${user.id}`,
      this.crypto.encrypt(secret, `self-totp:${user.id}`).toString('base64'),
      'EX',
      600,
    );
    return this.totpPresentation(staff.email, secret);
  }

  async selfTotpConfirm(user: AuthUser, code: string): Promise<{ recoveryCodes: string[] }> {
    const staff = await this.loadActive(user.id);
    const enc = await this.redis.get(`auth:self-totp:${user.id}`);
    if (!enc) throw new AppException('WRONG_STEP', 409, 'ابدأ إعداد التحقق بخطوتين أولاً');
    const secret = this.crypto.decrypt(Buffer.from(enc, 'base64'), `self-totp:${user.id}`).toString('utf8');
    if (verifyTotp(secret, code.trim()) === null) throw new AppException('INVALID_CODE', 401, 'الرمز غير صحيح');
    await this.redis.del(`auth:self-totp:${user.id}`);
    return { recoveryCodes: await this.enableTotp(staff, secret) };
  }

  /** Re-authentication (password or TOTP) → fresh access token with a new auth_time. */
  async reauth(
    user: AuthUser,
    input: { password?: string; code?: string },
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const staff = await this.loadActive(user.id);
    await this.assertNotLocked(staff.email);
    const ok = input.code
      ? await this.checkSecondFactor(staff, input.code)
      : await verifyPassword(staff.passwordHash, input.password ?? '');
    if (!ok) {
      await this.recordFailure(staff.email);
      throw new AppException('INVALID_CREDENTIALS', 401, 'بيانات التحقق غير صحيحة');
    }
    const authTime = Math.floor(Date.now() / 1000);
    await this.redis.set(`auth:authtime:${user.sid}`, String(authTime), 'EX', 15 * 24 * 3600);
    return this.tokens.sign(this.buildAuthUser(staff, user.sid, authTime));
  }

  async changePassword(user: AuthUser, current: string, next: string): Promise<void> {
    const staff = await this.loadActive(user.id);
    if (!(await verifyPassword(staff.passwordHash, current))) {
      await this.recordFailure(staff.email);
      throw new AppException('INVALID_CREDENTIALS', 401, 'كلمة المرور الحالية غير صحيحة');
    }
    await this.setPassword(staff, next);
    // Other sessions end; the current one continues.
    await this.prisma.refreshToken.updateMany({
      where: { subjectType: 'staff', subjectId: staff.id, revokedAt: null, NOT: { family: user.sid } },
      data: { revokedAt: new Date() },
    });
  }

  private async setPassword(user: StaffUser, password: string): Promise<void> {
    passwordSchema(user.email).parse(password);
    if (await verifyPassword(user.passwordHash, password)) {
      throw new AppException('PASSWORD_REUSED', 422, 'اختر كلمة مرور مختلفة عن الحالية');
    }
    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
    });
    await this.audit.record({
      action: 'auth.staff.password_changed',
      entityType: 'staff',
      entityId: user.id,
      actor: { type: 'staff', id: user.id },
    });
  }

  // ───────────────────────────── forgot / reset / invite ─────────────────────────────

  /** Always succeeds from the caller's point of view (no account enumeration). */
  async forgotPassword(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.findActiveByEmail(email);
    if (!user) return;
    const token = randomBytes(32).toString('base64url');
    await this.prisma.otpCode.updateMany({
      where: { destination: email, purpose: 'reset_password', consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.otpCode.create({
      data: {
        channel: 'email',
        destination: email,
        purpose: 'reset_password',
        codeHash: this.hasher.hash('reset-token', token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    const brand = (await this.settings.get('branding')).fullName;
    await this.email.sendTemplate(
      'password-reset',
      email,
      { brand, url: `${this.env.PUBLIC_URL}/admin/reset-password?token=${token}` },
      { type: 'staff', id: user.id },
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const codeHash = this.hasher.hash('reset-token', token);
    const row = await this.prisma.otpCode.findFirst({
      where: { codeHash, purpose: 'reset_password', consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new AppException('INVALID_TOKEN', 400, 'الرابط غير صالح أو منتهي الصلاحية');
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppException('INVALID_TOKEN', 400, 'الرابط غير صالح أو منتهي الصلاحية');
    const user = await this.findActiveByEmail(row.destination);
    if (!user) throw new AppException('INVALID_TOKEN', 400, 'الرابط غير صالح أو منتهي الصلاحية');
    await this.setPassword(user, password);
    await this.sessions.revokeAll('staff', user.id);
    await this.redis.del(this.lockKey(user.email));
  }

  async createInvite(user: { id: string; name: string; email: string }): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(`auth:invite:${this.hasher.hash('invite-token', token)}`, user.id, 'EX', INVITE_TTL_SEC);
    await this.redis.set(`auth:invite-of:${user.id}`, this.hasher.hash('invite-token', token), 'EX', INVITE_TTL_SEC);
    const brand = (await this.settings.get('branding')).fullName;
    await this.email.sendTemplate(
      'staff-invite',
      user.email,
      { brand, name: user.name, url: `${this.env.PUBLIC_URL}/admin/accept-invite?token=${token}` },
      { type: 'staff', id: user.id },
    );
  }

  async revokeInvite(userId: string): Promise<void> {
    const h = await this.redis.get(`auth:invite-of:${userId}`);
    if (h) await this.redis.del(`auth:invite:${h}`, `auth:invite-of:${userId}`);
  }

  async hasPendingInvite(userId: string): Promise<boolean> {
    return (await this.redis.exists(`auth:invite-of:${userId}`)) === 1;
  }

  async acceptInvite(token: string, password: string): Promise<void> {
    const invalid = () => new AppException('INVALID_TOKEN', 400, 'رابط الدعوة غير صالح أو منتهي الصلاحية');
    const key = `auth:invite:${this.hasher.hash('invite-token', token)}`;
    const userId = await this.redis.get(key);
    if (!userId) throw invalid();
    const user = await this.prisma.staffUser.findFirst({ where: { id: userId, isActive: true, deletedAt: null } });
    if (!user) throw invalid();
    // Validate first so a rejected password does not burn the one-time link…
    passwordSchema(user.email).parse(password);
    // …then consume it atomically (a concurrent second use fails here).
    if ((await this.redis.getdel(key)) !== userId) throw invalid();
    await this.redis.del(`auth:invite-of:${userId}`);
    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
    });
    await this.audit.record({
      action: 'auth.staff.invite_accepted',
      entityType: 'staff',
      entityId: user.id,
      actor: { type: 'staff', id: user.id },
    });
  }
}
