import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantsService, type CreateTenantInput } from './tenants.service.js';

const statusSchema = z.object({
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
});

// لوحة السوبر-أدمن (platform). حراسة مصادقة المنصّة تُضاف في مرحلة المنصّة (docs/12 §8).
@ApiTags('platform:tenants')
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
  create(@Body() body: CreateTenantInput) {
    return this.tenants.create(body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'تغيير حالة المشترك (trial/active/suspended/cancelled)' })
  setStatus(@Param('id') id: string, @Body() body: unknown) {
    const { status } = statusSchema.parse(body);
    return this.tenants.setStatus(id, status);
  }
}
