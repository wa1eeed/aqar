import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/** BullMQ queues (docs/10 §6). Processors run in the worker container (`node dist/worker`). */
export const QUEUES = {
  email: 'email',
  integrations: 'integrations',
  media: 'media',
  crm: 'crm',
  payments: 'payments',
} as const;
export const EMAIL_QUEUE = Symbol('EMAIL_QUEUE');
export const INTEGRATIONS_QUEUE = Symbol('INTEGRATIONS_QUEUE');
export const MEDIA_QUEUE = Symbol('MEDIA_QUEUE');
export const CRM_QUEUE = Symbol('CRM_QUEUE');
export const PAYMENTS_QUEUE = Symbol('PAYMENTS_QUEUE');
export const QUEUE_CONNECTION = Symbol('QUEUE_CONNECTION');

/** BullMQ requires maxRetriesPerRequest = null on its connection. */
export function queueConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, connectionName: 'nx-queue' });
}

@Injectable()
class QueueShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(EMAIL_QUEUE) private readonly email: Queue,
    @Inject(INTEGRATIONS_QUEUE) private readonly integrations: Queue,
    @Inject(MEDIA_QUEUE) private readonly media: Queue,
    @Inject(CRM_QUEUE) private readonly crm: Queue,
    @Inject(PAYMENTS_QUEUE) private readonly paymentsQ: Queue,
    @Inject(QUEUE_CONNECTION) private readonly conn: IORedis,
  ) {}
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.email.close(),
      this.integrations.close(),
      this.media.close(),
      this.crm.close(),
      this.paymentsQ.close(),
    ]);
    await this.conn.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    { provide: QUEUE_CONNECTION, inject: [ENV], useFactory: (env: Env) => queueConnection(env.REDIS_URL) },
    {
      provide: EMAIL_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (c: IORedis) => new Queue(QUEUES.email, { connection: c }),
    },
    {
      provide: INTEGRATIONS_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (c: IORedis) => new Queue(QUEUES.integrations, { connection: c }),
    },
    {
      provide: MEDIA_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (c: IORedis) => new Queue(QUEUES.media, { connection: c }),
    },
    {
      provide: CRM_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (c: IORedis) => new Queue(QUEUES.crm, { connection: c }),
    },
    {
      provide: PAYMENTS_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (c: IORedis) => new Queue(QUEUES.payments, { connection: c }),
    },
    QueueShutdown,
  ],
  exports: [EMAIL_QUEUE, INTEGRATIONS_QUEUE, MEDIA_QUEUE, CRM_QUEUE, PAYMENTS_QUEUE, QUEUE_CONNECTION],
})
export class QueueModule {}
