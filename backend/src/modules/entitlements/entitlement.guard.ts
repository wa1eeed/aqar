import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { EntitlementsService } from './entitlements.service.js';
import { REQUIRE_FEATURE_KEY } from './decorators.js';

/** حارس عالمي يفرض @RequireFeature مركزياً: حتى استدعاء API مباشر من باقة أدنى يُرفض. */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;
    await this.entitlements.assertFeature(this.tenant.requireTenantId(), feature);
    return true;
  }
}
