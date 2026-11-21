import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SeoService } from './seo.service.js';
import { SeoAdminService } from './seo-admin.service.js';
import { SeoPublicController } from './seo-public.controller.js';
import { SeoAdminController } from './seo-admin.controller.js';

@Module({
  imports: [AuthModule, SettingsModule],
  providers: [SeoService, SeoAdminService],
  controllers: [SeoPublicController, SeoAdminController],
  exports: [SeoService],
})
export class SeoModule {}
