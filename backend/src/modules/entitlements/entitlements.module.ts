import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EntitlementsService } from './entitlements.service.js';
import { UsageService } from './usage.service.js';
import { EntitlementGuard } from './entitlement.guard.js';

@Global()
@Module({
  providers: [
    EntitlementsService,
    UsageService,
    { provide: APP_GUARD, useClass: EntitlementGuard },
  ],
  exports: [EntitlementsService, UsageService],
})
export class EntitlementsModule {}
