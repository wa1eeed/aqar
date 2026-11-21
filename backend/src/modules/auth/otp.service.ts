import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { IntegrationsService } from '../integrations/integrations.service.js';

type Channel = 'email' | 'sms';
const MAX_ATTEMPTS = 5;
const TTL_MS = 10 * 60_000;

/** رموز OTP للعملاء (6 أرقام، 10 دقائق، 5 محاولات). الإرسال الفعلي عبر Resend/SMS في المرحلة 2. */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly tenant: TenantContext,
    private readonly integrations: IntegrationsService,
  ) {
    this.pepper = config.get<string>('APP_ENCRYPTION_KEY') ?? '';
  }

  private hash(destination: string, code: string): string {
    return createHash('sha256').update(`${this.pepper}:${destination}:${code}`).digest('hex');
  }

  async send(channel: Channel, destination: string, purpose = 'login'): Promise<void> {
    const tenantId = this.tenant.requireTenantId();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpCode.create({
      data: {
        tenantId,
        channel,
        destination,
        purpose: purpose as never,
        codeHash: this.hash(destination, code),
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });

    // الإرسال الفعلي عبر البوابة (Resend) إن كان البريد مُهيّأً؛ وإلا يُسجَّل محلياً.
    if (channel === 'email') {
      try {
        if (await this.integrations.isEmailReady()) {
          await this.integrations.sendEmail({
            to: destination,
            subject: 'رمز الدخول — منزلة',
            html: `<div dir="rtl" style="font-family:sans-serif"><p>رمز الدخول الخاص بك:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>صالح لمدّة 10 دقائق.</p></div>`,
            text: `رمز الدخول: ${code} (صالح 10 دقائق)`,
            idempotencyKey: `otp:${destination}:${Date.now()}`,
          });
          return;
        }
      } catch (e) {
        this.logger.warn(`تعذّر إرسال OTP بالبريد: ${String(e)}`);
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`OTP(${purpose}) ${destination} = ${code}`);
    }
  }

  async verify(destination: string, code: string, purpose = 'login'): Promise<boolean> {
    const tenantId = this.tenant.requireTenantId();
    const rec = await this.prisma.otpCode.findFirst({
      where: { tenantId, destination, purpose: purpose as never, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!rec || rec.expiresAt < new Date() || rec.attempts >= MAX_ATTEMPTS) return false;
    if (rec.codeHash !== this.hash(destination, code)) {
      await this.prisma.otpCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
      return false;
    }
    await this.prisma.otpCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } });
    return true;
  }
}
