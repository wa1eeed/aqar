import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service.js';
import { CurrentUser, RequirePlatform } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

// إدارة الباقات والاستحقاقات من لوحة السوبر-أدمن.
@ApiTags('platform:plans')
@RequirePlatform()
@Controller('super')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get('features')
  @ApiOperation({ summary: 'سجلّ الميزات المتاحة برمجياً (Feature Catalog)' })
  features() {
    return this.plans.listFeatures();
  }

  @Get('plans')
  @ApiOperation({ summary: 'الباقات واستحقاقاتها' })
  listPlans() {
    return this.plans.listPlans();
  }

  @Post('plans')
  @ApiOperation({ summary: 'إنشاء باقة' })
  createPlan(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.plans.createPlan(body, user.sub);
  }

  @Put('plans/:id/entitlements')
  @ApiOperation({ summary: 'ضبط استحقاقات باقة' })
  setPlanEntitlements(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.plans.setPlanEntitlements(id, body, user.sub);
  }

  @Get('tenants/:id/entitlements')
  @ApiOperation({ summary: 'استثناءات/إضافات المشترك' })
  tenantEntitlements(@Param('id') id: string) {
    return this.plans.tenantEntitlements(id);
  }

  @Put('tenants/:id/entitlements')
  @ApiOperation({ summary: 'ضبط استثناء/إضافة لمشترك' })
  setTenantEntitlement(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.plans.setTenantEntitlement(id, body, user.sub);
  }
}
