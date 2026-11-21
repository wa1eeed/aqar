import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Request } from 'express';
import { PropertiesService, type SavePropertyInput } from './properties.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const statusBody = z.object({ status: z.string(), reason: z.string().optional() });

@ApiTags('admin:properties')
@RequirePermissions('properties.view')
@Controller('admin/properties')
export class PropertiesAdminController {
  constructor(private readonly svc: PropertiesService) {}

  private actor(user: AuthUser, req: Request) {
    return { user, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Get()
  list(@Query() query: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.svc.adminList(query, user);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.svc.adminGet(id, user);
  }

  @Post()
  @RequirePermissions('properties.create')
  create(@Body() body: SavePropertyInput, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.create(body, this.actor(user, req));
  }

  @Put(':id')
  @RequirePermissions('properties.edit')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SavePropertyInput, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.update(id, body, this.actor(user, req));
  }

  @Post(':id/status')
  @RequirePermissions('properties.status')
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const { status, reason } = statusBody.parse(body);
    return this.svc.changeStatus(id, status, reason, this.actor(user, req));
  }

  @Post(':id/publish')
  @RequirePermissions('properties.publish')
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.publish(id, this.actor(user, req));
  }

  @Post(':id/unpublish')
  @RequirePermissions('properties.publish')
  unpublish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.unpublish(id, this.actor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('properties.delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.softDelete(id, this.actor(user, req));
  }
}
