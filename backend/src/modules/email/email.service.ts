import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_QUEUE } from '../../queue/queue.module';
import { IntegrationsGateway } from '../integrations/gateway.service';
import { IntegrationError } from '../integrations/types';
import { renderTemplate, type TemplateKey } from './templates';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  template: string;
}

export interface EmailJob extends OutgoingEmail {
  emailLogId: string;
}

/** docs/06 §1: 5 attempts, backoff 1 min → 1 h. */
export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: true,
  // Message bodies can contain one-time codes: failed jobs are kept only 24 h.
  removeOnFail: { age: 24 * 3600 },
};

/**
 * Email outbox. Every message gets an EmailLog row. When the Resend integration is ready the message
 * is queued and delivered by the worker through the IntegrationsGateway. Without it: test keeps
 * messages in memory, development also prints them, staging/production mark them failed (codes and
 * links never reach logs outside a developer's machine).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  /** Dev/test capture of the last messages (never used in production). */
  readonly captured: OutgoingEmail[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntegrationsGateway,
    @Inject(EMAIL_QUEUE) private readonly queue: Queue,
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

    if (await this.gateway.email().isReady()) {
      const job: EmailJob = { emailLogId: log.id, to, template, ...rendered };
      await this.queue.add('send', job, { ...EMAIL_JOB_OPTIONS, jobId: log.id });
      return;
    }

    if (this.env.NODE_ENV === 'production' || this.env.NODE_ENV === 'staging') {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'failed', error: 'EMAIL_PROVIDER_NOT_CONFIGURED' },
      });
      this.logger.error({ template, emailLogId: log.id }, 'email not sent: email integration is not configured');
      return;
    }
    this.captured.push({ to, template, ...rendered });
    if (this.captured.length > 50) this.captured.shift();
    if (this.env.NODE_ENV === 'development') {
      this.logger.warn(`[dev email] to=${to} subject="${rendered.subject}"\n${rendered.text}`);
    }
    await this.prisma.emailLog.update({ where: { id: log.id }, data: { status: 'sent' } });
  }

  /**
   * Worker side: one delivery attempt. Throws to let BullMQ retry; the final failure is recorded.
   * The idempotency key makes retries safe on Resend's side.
   */
  async deliver(job: EmailJob, attempt: number, maxAttempts: number): Promise<void> {
    try {
      const { id } = await this.gateway.email().send({
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
        idempotencyKey: `email:${job.emailLogId}`,
        tags: { template: job.template.replace(/[^a-zA-Z0-9_-]/g, '_') },
      });
      await this.prisma.emailLog.update({
        where: { id: job.emailLogId },
        data: { status: 'sent', resendId: id, error: null },
      });
    } catch (e) {
      const code = e instanceof IntegrationError ? e.code : 'EMAIL_SEND_FAILED';
      const permanent =
        e instanceof IntegrationError &&
        e.httpStatus !== undefined &&
        e.httpStatus >= 400 &&
        e.httpStatus < 500 &&
        e.httpStatus !== 429;
      if (permanent || attempt >= maxAttempts) {
        await this.prisma.emailLog.update({
          where: { id: job.emailLogId },
          data: {
            status: 'failed',
            error: `${code}${e instanceof IntegrationError && e.httpStatus ? ` (${e.httpStatus})` : ''}`,
          },
        });
        if (permanent) return; // do not retry a request the provider rejected
      }
      throw e;
    }
  }
}
