import { Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type EmailStatus } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsGateway } from '../integrations/gateway.service';
import { verifySvix } from '../integrations/providers/resend';

const STATUS: Record<string, EmailStatus> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

const invalidSignature = () => new AppException('INVALID_SIGNATURE', 401, 'توقيع غير صالح');

/**
 * Webhooks (docs/02 §7): verify → insert WebhookEvent (unique provider+externalId; duplicate → 200
 * no-op) → process → 200. Unsigned or badly signed requests are rejected before anything is stored.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntegrationsGateway,
    private readonly events: EventEmitter2,
  ) {}

  /** Resend email events (Svix signature verified, idempotent). */
  @Public()
  @RateLimit({ name: 'webhook-resend', limit: 600, windowSec: 60, by: 'ip' })
  @Post('resend')
  @HttpCode(200)
  async resend(@Req() req: Request & { rawBody?: Buffer }) {
    const secret = await this.gateway.email().webhookSecret();
    const raw = req.rawBody;
    const h = (n: string) => (typeof req.headers[n] === 'string' ? (req.headers[n] as string) : undefined);
    const headers = { id: h('svix-id'), timestamp: h('svix-timestamp'), signature: h('svix-signature') };
    if (!secret || !raw || !verifySvix(secret, headers, raw)) throw invalidSignature();

    const body = req.body as { type?: string; data?: { email_id?: string; to?: string[] } };
    const type = String(body.type ?? 'unknown').slice(0, 60);
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: 'resend',
          externalId: headers.id!,
          type,
          payload: body as Prisma.InputJsonValue,
          signatureValid: true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return { received: true, duplicate: true };
      throw e;
    }

    const status = STATUS[type];
    const emailId = body.data?.email_id;
    if (status && emailId) {
      const updated = await this.prisma.emailLog.updateMany({ where: { resendId: emailId }, data: { status } });
      if (status === 'bounced' && updated.count > 0) {
        const log = await this.prisma.emailLog.findUnique({ where: { resendId: emailId }, select: { to: true } });
        this.events.emit('email.bounced', { email: log?.to });
      }
    }
    await this.prisma.webhookEvent.update({
      where: { provider_externalId: { provider: 'resend', externalId: headers.id! } },
      data: { processedAt: new Date() },
    });
    this.logger.log({ type }, 'resend webhook processed');
    return { received: true };
  }
}
