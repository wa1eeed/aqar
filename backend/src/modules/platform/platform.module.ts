import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { TenantsController } from './tenants.controller.js';

// لوحة السوبر-أدمن (platform): إدارة المشتركين والخطط والنطاقات (تُضاف تدريجياً).
@Module({
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService],
})
export class PlatformModule {}
