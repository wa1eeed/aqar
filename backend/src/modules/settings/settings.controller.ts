import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SettingsService } from './settings.service.js';

// ملاحظة: حراسة الصلاحيات (settings.manage) تُضاف في المرحلة 1 (docs/03).
@ApiTags('settings')
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
  @ApiOperation({ summary: 'تحديث قسم إعدادات (بعد التحقّق من zod)' })
  update(
    @Param('key') key: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.settings.update(key, body, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }
}
