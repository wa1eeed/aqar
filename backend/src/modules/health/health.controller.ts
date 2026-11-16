import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';

type Check = 'ok' | 'down';

async function withTimeout(p: Promise<unknown>, ms: number): Promise<Check> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([p, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('timeout')), ms)))]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Liveness/readiness (docs/10 §5). Reports component states only — no versions, hosts or errors. */
@ApiTags('health')
@Public()
@Controller()
export class HealthController {
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    process.once('SIGTERM', () => (this.shuttingDown = true));
  }

  private async checks() {
    const [db, redis] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 2000),
      withTimeout(this.redis.ping(), 2000),
    ]);
    // Queue lag is reported once the worker queues exist (Phase 2+); 0 means "no backlog".
    return { db, redis, queueLag: 0 };
  }

  // The status code depends on the checks, so the response is written directly.
  @Get('health')
  async health(@Res() res: Response): Promise<void> {
    const checks = await this.checks();
    const ok = checks.db === 'ok' && checks.redis === 'ok';
    res
      .status(ok ? 200 : 503)
      .setHeader('Cache-Control', 'no-store')
      .json({ status: ok ? 'ok' : 'degraded', checks, uptimeSec: Math.round(process.uptime()) });
  }

  @Get('ready')
  async ready(@Res() res: Response): Promise<void> {
    const checks = await this.checks();
    const ready = !this.shuttingDown && checks.db === 'ok' && checks.redis === 'ok';
    res
      .status(ready ? 200 : 503)
      .setHeader('Cache-Control', 'no-store')
      .json({ ready });
  }
}
