import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantsService, type CreateTenantInput } from './tenants.service.js';
import { CurrentUser, RequirePlatform } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const statusSchema = z.object({
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
});

// لوحة السوبر-أدمن (platform) — تتطلّب مستخدم منصّة.
@ApiTags('platform:tenants')
@RequirePlatform()
@Controller('super/tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'كل المشتركين (مكاتب العقار)' })
  list() {
    return this.tenants.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل مشترك' })
  get(@Param('id') id: string) {
    return this.tenants.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء مشترك جديد (يُهيّئ أدواره وإعداداته ومالكه)' })
  create(@Body() body: CreateTenantInput, @CurrentUser() user: AuthUser) {
    return this.tenants.create(body, user.sub);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'تغيير حالة المشترك (trial/active/suspended/cancelled)' })
  setStatus(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { status } = statusSchema.parse(body);
    return this.tenants.setStatus(id, status, user.sub);
  }
}
