import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../errors/app-exception';

export const REQUIRE_CSRF = 'nx:requireCsrf';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'nx';

/**
 * Cookie-authenticated endpoints (refresh/logout) must send `X-Requested-With: nx` (docs/10 §1).
 * Browsers cannot add custom headers to cross-site form posts, and CORS is same-origin only.
 */
export const RequireCsrfHeader = () => SetMetadata(REQUIRE_CSRF, true);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_CSRF, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new AppException('CSRF_CHECK_FAILED', 403, 'تعذّر التحقق من مصدر الطلب');
    }
    return true;
  }
}
