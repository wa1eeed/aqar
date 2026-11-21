import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SettingsService } from './settings.service.js';
import { CurrentUser, RequireStaff } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

@ApiTags('settings')
@RequireStaff()
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'كل أقسام الإعدادات بقيمها الحالية' })
  getAll(): Promise<Record<string, unknown>> {
    return this.settings.getAll();
  }

  @Get(':key')
  @ApiOperation({ summary: 'قيمة قسم إعدادات واحد' })
  getOne(@Param('key') key: string): Promise<unknown> {
    return this.settings.get(key as never);
  }

  @Patch(':key')
  @ApiOperation({ summary: 'تحديث قسم إعدادات (بعد التحقّق من zod والصلاحية)' })
  update(
    @Param('key') key: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.settings.update(key, body, {
      id: user.sub,
      perms: user.perms,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }
}
