import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { IntegrationsService } from './integrations.service.js';
import { CurrentUser, RequirePlatform } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const enabledSchema = z.object({ enabled: z.boolean() });

// تكاملات المنصّة (platform): R2، Resend، OSM، Overpass — يديرها السوبر-أدمن.
@ApiTags('platform:integrations')
@RequirePlatform()
@Controller('super/integrations')
export class PlatformIntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  private actor(user: AuthUser, req: Request) {
    return { id: user.sub, ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Get()
  list() {
    return this.svc.describeProviders('platform');
  }

  @Get(':key')
  get(@Param('key') key: string) {
    this.svc.assertScope(key, 'platform');
    return this.svc.getIntegration(key);
  }

  @Patch(':key/config')
  saveConfig(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    this.svc.assertScope(key, 'platform');
    return this.svc.saveConfig(key, body, this.actor(user, req));
  }

  @Patch(':key/secrets')
  saveSecrets(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    this.svc.assertScope(key, 'platform');
    return this.svc.saveSecrets(key, body, this.actor(user, req));
  }

  @Patch(':key/enabled')
  setEnabled(@Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    this.svc.assertScope(key, 'platform');
    return this.svc.setEnabled(key, enabledSchema.parse(body).enabled, this.actor(user, req));
  }

  @Post(':key/test')
  test(@Param('key') key: string) {
    this.svc.assertScope(key, 'platform');
    return this.svc.testConnection(key);
  }

  @Get(':key/logs')
  logs(@Param('key') key: string) {
    this.svc.assertScope(key, 'platform');
    return this.svc.callLogs(key);
  }
}
