import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { NotificationsService, type Recipient } from './notifications.service.js';
import { CurrentUser, RequireCustomer, RequirePermissions, RequireStaff } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const readSchema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() });
const prefSchema = z.object({ eventKey: z.string(), inApp: z.boolean(), email: z.boolean(), sms: z.boolean() });
const broadcastSchema = z.object({ roles: z.array(z.string()).default([]), title: z.string().min(2), body: z.string().min(2) });

@ApiTags('notifications')
@RequireStaff()
@Controller('admin')
export class AdminNotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  private me(u: AuthUser): Recipient {
    return { type: 'staff', id: u.sub };
  }

  @Get('notifications')
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('page') page?: string) {
    return this.svc.list(this.me(u), { unread: unread === '1' || unread === 'true', page: page ? Number(page) : 1 });
  }

  @Post('notifications/read')
  read(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.svc.markRead(this.me(u), readSchema.parse(body));
  }

  @Post('notifications/broadcast')
  @RequirePermissions('notifications.broadcast')
  broadcast(@Body() body: unknown) {
    const { roles, title, body: text } = broadcastSchema.parse(body);
    return this.svc.broadcast(roles, title, text);
  }

  @Get('notification-preferences')
  prefs(@CurrentUser() u: AuthUser) {
    return this.svc.getPreferences(this.me(u));
  }

  @Put('notification-preferences')
  setPref(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const p = prefSchema.parse(body);
    return this.svc.setPreference(this.me(u), p.eventKey, { inApp: p.inApp, email: p.email, sms: p.sms });
  }
}

@ApiTags('customer:notifications')
@RequireCustomer()
@Controller('me')
export class CustomerNotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  private me(u: AuthUser): Recipient {
    return { type: 'customer', id: u.sub };
  }

  @Get('notifications')
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('page') page?: string) {
    return this.svc.list(this.me(u), { unread: unread === '1' || unread === 'true', page: page ? Number(page) : 1 });
  }

  @Post('notifications/read')
  read(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.svc.markRead(this.me(u), readSchema.parse(body));
  }

  @Get('notification-preferences')
  prefs(@CurrentUser() u: AuthUser) {
    return this.svc.getPreferences(this.me(u));
  }

  @Put('notification-preferences')
  setPref(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const p = prefSchema.parse(body);
    return this.svc.setPreference(this.me(u), p.eventKey, { inApp: p.inApp, email: p.email, sms: p.sms });
  }
}
