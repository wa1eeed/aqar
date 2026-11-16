import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app-exception';
import { IS_PUBLIC } from './public.decorator';

/**
 * Global default-deny guard. Routes must be explicitly `@Public()` or carry a valid access token.
 * Token verification (staff + customer JWT) is added in Phase 1 (docs/03); until then every
 * non-public route answers 401, so nothing can be exposed by accident.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    throw new AppException('UNAUTHENTICATED', 401, 'يلزم تسجيل الدخول');
  }
}
