import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { createRedis } from '../../redis/redis.module';
import { SOCKET_KEY } from './realtime.service';

/** Socket.IO with the Redis adapter so several API containers broadcast correctly (docs/02 §9). */
export class RedisIoAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    this.pub = createRedis(this.redisUrl, 'nx-socket-pub');
    this.sub = createRedis(this.redisUrl, 'nx-socket-sub');
    server.adapter(createAdapter(this.pub, this.sub, { key: SOCKET_KEY }));
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.allSettled([this.pub?.quit(), this.sub?.quit()]);
  }
}
