import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { TenantsController } from './tenants.controller.js';
import { PlansService } from './plans.service.js';
import { PlansController } from './plans.controller.js';
import { RegistrationService } from './registration.service.js';
import { PublicRegistrationController } from './public-registration.controller.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import {
  PlatformSettingsController,
  PublicPlatformController,
} from './platform-settings.controller.js';

// لوحة السوبر-أدمن (platform): إدارة المشتركين والباقات والاستحقاقات،
// والتسجيل الذاتي العام للمكاتب، وإعدادات علامة المنصة والـSEO.
@Module({
  providers: [TenantsService, PlansService, RegistrationService, PlatformSettingsService],
  controllers: [
    TenantsController,
    PlansController,
    PublicRegistrationController,
    PlatformSettingsController,
    PublicPlatformController,
  ],
  exports: [TenantsService],
})
export class PlatformModule {}
