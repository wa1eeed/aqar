import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { IntegrationsService } from './integrations.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const enabledSchema = z.object({ enabled: z.boolean() });

// تكاملات المكتب (per-tenant): Moyasar، Google، REGA، Ejar، Nafath، SMS…
@ApiTags('integrations')
@RequirePermissions('integrations.manage')
@Controller('admin/integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  private actor(user: AuthUser, req: Request) {
    return { id: user.sub, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Get()
  @ApiOperation({ summary: 'تكاملات المكتب (نماذج مُولَّدة من المخطّطات)' })
  list() {
    return this.svc.describeProviders('tenant');
  }

  @Get(':key')
  get(@Param('key') key: string) {
    this.svc.assertScope(key, 'tenant');
    return this.svc.getIntegration(key);
  }

  @Patch(':key/config')
  saveConfig(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    this.svc.assertScope(key, 'tenant');
    return this.svc.saveConfig(key, body, this.actor(user, req));
  }

  @Patch(':key/secrets')
  @ApiOperation({ summary: 'حفظ الأسرار (مشفّرة؛ لا تُعاد أبداً)' })
  saveSecrets(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    this.svc.assertScope(key, 'tenant');
    return this.svc.saveSecrets(key, body, this.actor(user, req));
  }

  @Patch(':key/enabled')
  setEnabled(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    this.svc.assertScope(key, 'tenant');
    return this.svc.setEnabled(key, enabledSchema.parse(body).enabled, this.actor(user, req));
  }

  @Post(':key/test')
  @ApiOperation({ summary: 'اختبار الاتصال' })
  test(@Param('key') key: string) {
    this.svc.assertScope(key, 'tenant');
    return this.svc.testConnection(key);
  }

  @Get(':key/logs')
  logs(@Param('key') key: string) {
    this.svc.assertScope(key, 'tenant');
    return this.svc.callLogs(key);
  }
}
