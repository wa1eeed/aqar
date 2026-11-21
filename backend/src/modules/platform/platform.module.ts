import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { TenantsController } from './tenants.controller.js';
import { PlansService } from './plans.service.js';
import { PlansController } from './plans.controller.js';

// لوحة السوبر-أدمن (platform): إدارة المشتركين والباقات والاستحقاقات.
@Module({
  providers: [TenantsService, PlansService],
  controllers: [TenantsController, PlansController],
  exports: [TenantsService],
})
export class PlatformModule {}
