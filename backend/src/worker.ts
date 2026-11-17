import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Worker, type Queue } from 'bullmq';
import { LoggerModule, Logger as PinoLogger } from 'nestjs-pino';
import { loggerParams } from './common/logging';
import { ConfigModule, ENV } from './config/config.module';
import { loadEnv, type Env } from './config/env';
import { AuditModule } from './modules/audit/audit.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { EmailModule } from './modules/email/email.module';
import { EmailService, type EmailJob } from './modules/email/email.service';
import { IntegrationsGateway } from './modules/integrations/gateway.service';
import { IntegrationsCoreModule } from './modules/integrations/integrations.module';
import { MediaCoreModule } from './modules/media/media.module';
import { MediaService, type MediaJob } from './modules/media/media.service';
import { PropertiesModule } from './modules/properties/properties.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import {
  CRM_QUEUE,
  PAYMENTS_QUEUE,
  INTEGRATIONS_QUEUE,
  QUEUES,
  QueueModule,
  queueConnection,
} from './queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BookingsCoreModule } from './modules/bookings/bookings.module';
import { BookingsService } from './modules/bookings/bookings.service';
import { PaymentsService } from './modules/payments/payments.service';
import { CustomersService } from './modules/customers/customers.service';
import { CrmJobsService } from './modules/notifications/crm-jobs.service';
import { NotificationsCoreModule } from './modules/notifications/notifications.module';
import { RealtimeCoreModule } from './modules/realtime/realtime.service';
import { RedisModule } from './redis/redis.module';

/** Background worker (same image as the API, `node dist/worker`). Queues per docs/10 §6. */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    SettingsModule,
    QueueModule,
    RealtimeCoreModule,
    IntegrationsCoreModule,
    EmailModule,
    AuthModule,
    NotificationsCoreModule,
    CustomersModule,
    BookingsCoreModule,
    PropertiesModule,
    MediaCoreModule,
  ],
})
class WorkerModule {}

const HEALTH_EVERY_MS = 15 * 60 * 1000;
const PRUNE_EVERY_MS = 24 * 3600 * 1000;
const CALL_LOG_RETENTION_DAYS = 30;

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  const log = new Logger('Worker');
  const email = app.get(EmailService);
  const gateway = app.get(IntegrationsGateway);
  const prisma = app.get(PrismaService);

  const emailWorker = new Worker<EmailJob>(
    QUEUES.email,
    (job) => email.deliver(job.data, job.attemptsMade + 1, job.opts.attempts ?? 1),
    { connection: queueConnection(env.REDIS_URL), concurrency: 5 },
  );

  const media = app.get(MediaService);
  const mediaWorker = new Worker<MediaJob>(QUEUES.media, (job) => media.process(job.data.mediaId), {
    connection: queueConnection(env.REDIS_URL),
    concurrency: 2,
  });
  mediaWorker.on('failed', (job) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) void media.markFailed(job.data.mediaId);
  });

  const integrationsWorker = new Worker(
    QUEUES.integrations,
    async (job) => {
      if (job.name === 'health') await gateway.checkAllHealth();
      if (job.name === 'prune') {
        const cutoff = new Date(Date.now() - CALL_LOG_RETENTION_DAYS * 86_400_000);
        const { count } = await prisma.integrationCallLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
        log.log(`pruned ${count} integration call logs`);
      }
    },
    { connection: queueConnection(env.REDIS_URL), concurrency: 1 },
  );

  const crmJobs = app.get(CrmJobsService);
  const customers = app.get(CustomersService);
  const crmWorker = new Worker(
    QUEUES.crm,
    async (job) => {
      if (job.name === 'viewing-reminders') await crmJobs.viewingReminders();
      if (job.name === 'saved-search-digest') await crmJobs.savedSearchDigest();
      if (job.name === 'anonymise-deleted') {
        const n = await customers.anonymiseDeleted();
        if (n) log.log(`anonymised ${n} deleted customer accounts`);
      }
    },
    { connection: queueConnection(env.REDIS_URL), concurrency: 1 },
  );
  const crm = app.get<Queue>(CRM_QUEUE);
  await crm.upsertJobScheduler('viewing-reminders', { every: 15 * 60 * 1000 }, { name: 'viewing-reminders' });
  // 09:00 Riyadh (06:00 UTC) daily digest; anonymisation at 03:30 Riyadh.
  await crm.upsertJobScheduler(
    'saved-search-digest',
    { pattern: '0 6 * * *', tz: 'UTC' },
    { name: 'saved-search-digest' },
  );
  await crm.upsertJobScheduler(
    'anonymise-deleted',
    { pattern: '30 0 * * *', tz: 'UTC' },
    { name: 'anonymise-deleted' },
  );

  // Payments: webhook-triggered reconciles, the 5-minute reconcile sweep and hold expiry (docs/04 §4–5).
  const payments = app.get(PaymentsService);
  const bookings = app.get(BookingsService);
  const paymentsWorker = new Worker<{ paymentId?: string; hintPaymentId?: string | null }>(
    QUEUES.payments,
    async (job) => {
      if (job.name === 'reconcile' && job.data.paymentId) {
        await payments.reconcile(job.data.paymentId, {
          source: 'webhook',
          ...(job.data.hintPaymentId ? { hintPaymentId: job.data.hintPaymentId } : {}),
        });
      }
      if (job.name === 'reconcile-pending') await payments.reconcilePending();
      if (job.name === 'expire-holds') {
        const n = await bookings.expireHolds();
        if (n) log.log(`expired ${n} booking holds`);
      }
    },
    { connection: queueConnection(env.REDIS_URL), concurrency: 2 },
  );
  const paymentsQueue = app.get<Queue>(PAYMENTS_QUEUE);
  await paymentsQueue.upsertJobScheduler('reconcile-pending', { every: 5 * 60 * 1000 }, { name: 'reconcile-pending' });
  await paymentsQueue.upsertJobScheduler('expire-holds', { every: 60 * 1000 }, { name: 'expire-holds' });

  const queue = app.get<Queue>(INTEGRATIONS_QUEUE);
  await queue.upsertJobScheduler('integrations-health', { every: HEALTH_EVERY_MS }, { name: 'health' });
  await queue.upsertJobScheduler('maintenance-prune', { every: PRUNE_EVERY_MS }, { name: 'prune' });

  for (const w of [emailWorker, integrationsWorker, mediaWorker, crmWorker, paymentsWorker]) {
    w.on('failed', (job, err) =>
      log.warn({ queue: w.name, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'job failed'),
    );
  }

  const shutdown = async () => {
    log.log('worker shutting down');
    await Promise.allSettled([
      emailWorker.close(),
      integrationsWorker.close(),
      mediaWorker.close(),
      crmWorker.close(),
      paymentsWorker.close(),
    ]);
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  log.log('worker ready');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
