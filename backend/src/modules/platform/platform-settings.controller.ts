import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformSettingsService } from './platform-settings.service.js';
import { Public, RequirePlatform } from '../auth/decorators.js';

// السوبر-أدمن: قراءة/تعديل علامة المنصة وإعدادات الـSEO.
@ApiTags('platform:settings')
@RequirePlatform()
@Controller('super/settings')
export class PlatformSettingsController {
  constructor(private readonly svc: PlatformSettingsService) {}

  @Get('branding')
  get() {
    return this.svc.getBranding();
  }

  @Put('branding')
  update(@Body() body: unknown) {
    return this.svc.updateBranding(body);
  }
}

// عام: علامة المنصة لاستهلاكها في الموقع التسويقي.
@ApiTags('public:platform')
@Public()
@Controller('public/platform')
export class PublicPlatformController {
  constructor(private readonly svc: PlatformSettingsService) {}

  @Get('branding')
  branding() {
    return this.svc.getBranding();
  }
}
