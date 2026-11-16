import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

export function createRedis(url: string, name: string): Redis {
  return new Redis(url, {
    connectionName: name,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => createRedis(env.REDIS_URL, 'nx-api') },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
