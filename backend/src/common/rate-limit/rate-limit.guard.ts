import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app-exception';
import { DEFAULT_PUBLIC_GET, RATE_LIMIT, type RateLimitRule } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

function subject(rule: RateLimitRule, req: Request): string | null {
  if (rule.by === 'ip') return `ip:${req.ip ?? 'unknown'}`;
  const field = rule.by.slice('body:'.length);
  const value = (req.body as Record<string, unknown> | undefined)?.[field];
  if (typeof value !== 'string' || value.length === 0) return null;
  // Hash so raw emails/phones never become Redis keys.
  return `${field}:${createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32)}`;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    let rules = this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(RATE_LIMIT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rules && req.method === 'GET' && req.path.startsWith('/api/v1/public/')) rules = [DEFAULT_PUBLIC_GET];
    if (!rules?.length) return true;

    for (const rule of rules) {
      const who = subject(rule, req);
      if (!who) continue;
      let result;
      try {
        result = await this.limiter.hit(`${rule.name}:${who}`, rule.limit, rule.windowSec);
      } catch (err) {
        this.limiter.logFailure(err);
        if (rule.failClosed) throw new AppException('SERVICE_UNAVAILABLE', 503, 'الخدمة غير متاحة مؤقتاً');
        continue;
      }
      res.setHeader('RateLimit-Limit', String(result.limit));
      res.setHeader('RateLimit-Remaining', String(result.remaining));
      if (!result.allowed) {
        throw new AppException('RATE_LIMITED', 429, 'عدد كبير من المحاولات، حاول لاحقاً', {
          retryAfterSec: result.retryAfterSec,
        });
      }
    }
    return true;
  }
}
