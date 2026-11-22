import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StaffService, type CreateStaffInput, type UpdateStaffInput } from './staff.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

@ApiTags('staff')
@RequirePermissions('staff.manage')
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  private actor(user: AuthUser, req: Request) {
    return { id: user.sub, role: user.role, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Get()
  @ApiOperation({ summary: 'قائمة موظفي المكتب' })
  async list() {
    return { items: await this.staff.list() };
  }

  @Post()
  @ApiOperation({ summary: 'إضافة موظف وإرسال دعوة' })
  create(@Body() body: CreateStaffInput, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.staff.create(body, this.actor(user, req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تعديل موظف' })
  update(@Param('id') id: string, @Body() body: UpdateStaffInput, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.staff.update(id, body, this.actor(user, req));
  }

  @Post(':id/reset-2fa')
  @ApiOperation({ summary: 'إعادة ضبط التحقّق الثنائي للموظف' })
  reset2fa(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.staff.reset2fa(id, this.actor(user, req));
  }
}
