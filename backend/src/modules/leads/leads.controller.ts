import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Request } from 'express';
import { LeadsService } from './leads.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const stageSchema = z.object({ stage: z.enum(['new', 'contacted', 'viewing', 'negotiation', 'won', 'lost']) });
const assignSchema = z.object({ assigneeId: z.string().min(1) });
const activitySchema = z.object({ type: z.enum(['note', 'call', 'whatsapp', 'email']), body: z.string().min(1) });

@ApiTags('admin:leads')
@RequirePermissions('leads.view')
@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly svc: LeadsService) {}
  private actor(user: AuthUser, req: Request) {
    return { user, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Get()
  list(@Query() query: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.svc.adminList(query, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.adminGet(id, user);
  }

  @Post(':id/stage')
  @RequirePermissions('leads.manage')
  stage(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.changeStage(id, stageSchema.parse(body).stage, this.actor(user, req));
  }

  @Post(':id/assign')
  @RequirePermissions('leads.assign')
  assign(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.svc.assign(id, assignSchema.parse(body).assigneeId, this.actor(user, req));
  }

  @Post(':id/activities')
  @RequirePermissions('leads.manage')
  activity(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const { type, body: text } = activitySchema.parse(body);
    return this.svc.addActivity(id, type, text, this.actor(user, req));
  }
}
