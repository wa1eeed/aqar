import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';

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
