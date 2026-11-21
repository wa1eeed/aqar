import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RolesService, type CreateRoleInput, type UpdateRoleInput } from './roles.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

@ApiTags('roles')
@RequirePermissions('roles.manage')
@Controller('admin/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  private actor(user: AuthUser, req: Request) {
    return { id: user.sub, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Get()
  @ApiOperation({ summary: 'الأدوار (نظامية + مخصّصة)' })
  list() {
    return this.roles.list();
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء دور مخصّص' })
  create(@Body() body: CreateRoleInput, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.roles.create(body, this.actor(user, req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تعديل دور (النظامية: الاسم فقط)' })
  update(@Param('id') id: string, @Body() body: UpdateRoleInput, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.roles.update(id, body, this.actor(user, req));
  }
}
