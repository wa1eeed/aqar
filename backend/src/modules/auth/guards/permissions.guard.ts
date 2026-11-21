import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY, PLATFORM_KEY, STAFF_KEY } from '../decorators.js';

/** حارس التفويض: يفرض @RequirePermissions (صلاحيات الموظف) و@RequirePlatform (السوبر-أدمن). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const perms = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets);
    const platform = this.reflector.getAllAndOverride<boolean | undefined>(PLATFORM_KEY, targets);
    const staffOnly = this.reflector.getAllAndOverride<boolean | undefined>(STAFF_KEY, targets);
    if (!perms?.length && !platform && !staffOnly) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new UnauthorizedException('مطلوب تسجيل الدخول');

    if (platform) {
      if (user.typ !== 'platform') throw new ForbiddenException('يتطلّب صلاحية المنصّة (سوبر-أدمن)');
      return true;
    }

    if ((staffOnly || perms?.length) && user.typ !== 'staff') {
      throw new ForbiddenException('يتطلّب حساب موظف');
    }
    if (perms?.length && !perms.every((p) => user.perms?.includes(p))) {
      throw new ForbiddenException('صلاحيات غير كافية');
    }
    return true;
  }
}
