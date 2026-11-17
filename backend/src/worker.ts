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
import { SettingsModule } from './modules/settings/settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { INTEGRATIONS_QUEUE, QUEUES, QueueModule, queueConnection } from './queue/queue.module';
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
    IntegrationsCoreModule,
    EmailModule,
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

  const queue = app.get<Queue>(INTEGRATIONS_QUEUE);
  await queue.upsertJobScheduler('integrations-health', { every: HEALTH_EVERY_MS }, { name: 'health' });
  await queue.upsertJobScheduler('maintenance-prune', { every: PRUNE_EVERY_MS }, { name: 'prune' });

  for (const w of [emailWorker, integrationsWorker]) {
    w.on('failed', (job, err) =>
      log.warn({ queue: w.name, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'job failed'),
    );
  }

  const shutdown = async () => {
    log.log('worker shutting down');
    await Promise.allSettled([emailWorker.close(), integrationsWorker.close()]);
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
