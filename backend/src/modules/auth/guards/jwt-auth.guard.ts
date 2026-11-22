import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokensService } from '../tokens.service.js';
import { TenantContext } from '../../../common/tenant/tenant-context.js';
import { IS_PUBLIC_KEY } from '../decorators.js';

/** حارس مصادقة عالمي: يتحقّق من رمز الوصول ويضبط req.user. @Public يتجاوزه. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly tenant: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (token) {
      try {
        const user = this.tokens.verifyAccess(token);
        // عزل: رمز مشترك لا يعمل في سياق مشترك آخر
        if (user.typ === 'staff' || user.typ === 'customer') {
          const current = this.tenant.tenantId;
          if (user.tid && current && user.tid !== current) {
            throw new UnauthorizedException('الرمز لا يطابق المشترك الحالي');
          }
          // دخول موحّد للمكاتب: على الرابط الموحّد (بلا مستأجر في السياق)،
          // خذ المستأجر من توكن الموظف ليعمل عزل البيانات.
          if (user.typ === 'staff' && user.tid && !current) {
            this.tenant.setTenantId(user.tid);
          }
        }
        req.user = user;
      } catch (err) {
        if (!isPublic) throw err instanceof UnauthorizedException ? err : new UnauthorizedException('رمز غير صالح');
      }
    }

    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('مطلوب تسجيل الدخول');
    return true;
  }
}
