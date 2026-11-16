import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a slot frees up. */
  retryAfterSec: number;
}

/**
 * Sliding-window log in a Redis sorted set, atomic via Lua (docs/02 §1 rate limits).
 * Only attempts that are allowed are recorded, so a blocked client cannot extend its own ban.
 */
const SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, count + 1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry = window
if oldest[2] then retry = tonumber(oldest[2]) + window - now end
return {0, count, retry}
`;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private seq = 0;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(bucket: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const now = Date.now();
    const member = `${now}-${process.pid}-${(this.seq = (this.seq + 1) % 1_000_000)}`;
    const [allowed, count, retryMs] = (await this.redis.eval(
      SCRIPT,
      1,
      `rl:${bucket}`,
      now,
      windowSec * 1000,
      limit,
      member,
    )) as [number, number, number];
    return {
      allowed: allowed === 1,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)),
    };
  }

  /** Clears a bucket (e.g. after a successful login). */
  async reset(bucket: string): Promise<void> {
    await this.redis.del(`rl:${bucket}`);
  }

  logFailure(err: unknown): void {
    this.logger.warn({ err }, 'rate limiter unavailable');
  }
}
