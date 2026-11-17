import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { renderTemplate, type TemplateKey } from './templates';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  template: string;
}

/**
 * Email outbox. Every message is recorded in EmailLog. Delivery through Resend is added by the
 * integrations gateway in Phase 2 (docs/05); until then non-production environments keep messages
 * in memory (tests read them) and production marks them failed with a clear reason.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  /** Dev/test capture of the last messages (never used in production). */
  readonly captured: OutgoingEmail[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async sendTemplate(
    template: TemplateKey,
    to: string,
    vars: Record<string, string>,
    related?: { type: string; id: string },
  ): Promise<void> {
    const rendered = renderTemplate(template, vars);
    const log = await this.prisma.emailLog.create({
      data: {
        to,
        template,
        subject: rendered.subject,
        relatedType: related?.type ?? null,
        relatedId: related?.id ?? null,
      },
    });
    if (this.env.NODE_ENV === 'production') {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'failed', error: 'EMAIL_PROVIDER_NOT_CONFIGURED' },
      });
      this.logger.error({ template, emailLogId: log.id }, 'email not sent: no email provider configured');
      return;
    }
    this.captured.push({ to, template, ...rendered });
    if (this.captured.length > 50) this.captured.shift();
    if (this.env.NODE_ENV !== 'test') {
      // Development only: the message (incl. links/codes) is visible to the developer in the console.
      this.logger.warn(`[dev email] to=${to} subject="${rendered.subject}"\n${rendered.text}`);
    }
    await this.prisma.emailLog.update({ where: { id: log.id }, data: { status: 'sent' } });
  }
}
