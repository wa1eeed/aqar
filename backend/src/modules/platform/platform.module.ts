import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { TenantsController } from './tenants.controller.js';
import { PlansService } from './plans.service.js';
import { PlansController } from './plans.controller.js';
import { RegistrationService } from './registration.service.js';
import { PublicRegistrationController } from './public-registration.controller.js';

// لوحة السوبر-أدمن (platform): إدارة المشتركين والباقات والاستحقاقات،
// والتسجيل الذاتي العام للمكاتب العقارية.
@Module({
  providers: [TenantsService, PlansService, RegistrationService],
  controllers: [TenantsController, PlansController, PublicRegistrationController],
  exports: [TenantsService],
})
export class PlatformModule {}
