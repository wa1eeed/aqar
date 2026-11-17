import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type Redis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { createRedis } from '../../redis/redis.module';

/** Socket.IO key shared by the API adapter and every emitter (API + worker). */
export const SOCKET_KEY = 'nx-socket';

export const rooms = {
  public: 'public',
  property: (id: number) => `property:${id}`,
  customer: (id: string) => `customer:${id}`,
  staff: 'staff',
  staffUser: (id: string) => `staff:${id}`,
  role: (key: string) => `role:${key}`,
};

/**
 * Server → client events (docs/02 §9). Publishes through Redis so any process (API containers,
 * worker) can reach every connected client; the API's Socket.IO server uses the matching adapter.
 * Payloads are minimal by design: clients refetch details through the REST API (which enforces
 * permissions), so a socket event never leaks more than ids and status.
 */
@Injectable()
export class RealtimeService implements OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly emitter: Emitter;
  private closed = false;

  /** Late events during shutdown are dropped instead of failing on a closed connection. */
  private usable(): boolean {
    return !this.closed && this.redis.status !== 'end' && this.redis.status !== 'close';
  }

  constructor(@Inject(ENV) env: Env) {
    this.redis = createRedis(env.REDIS_URL, 'nx-realtime-pub');
    this.emitter = new Emitter(this.redis, { key: SOCKET_KEY });
  }

  emit(room: string | string[], event: string, payload: Record<string, unknown>): void {
    const list = Array.isArray(room) ? room : [room];
    if (!list.length || !this.usable()) return;
    this.emitter.to(list).emit(event, payload);
  }

  /** Drops live sockets of a subject (logout everywhere, block, password reset). */
  disconnect(typ: 'staff' | 'customer', id: string): void {
    if (!this.usable()) return;
    this.emitter.in(typ === 'staff' ? rooms.staffUser(id) : rooms.customer(id)).disconnectSockets(true);
  }

  async onApplicationShutdown(): Promise<void> {
    this.closed = true;
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeCoreModule {}
