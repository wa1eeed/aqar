import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { PropertiesService } from './properties.service.js';
import { MediaService } from './media.service.js';
import { PropertiesAdminController } from './properties.controller.js';
import { PublicPropertiesController } from './public-properties.controller.js';
import { PublicConfigController } from './public-config.controller.js';
import { MediaController } from './media.controller.js';

@Module({
  imports: [AuthModule, SettingsModule],
  providers: [PropertiesService, MediaService],
  controllers: [
    PropertiesAdminController,
    PublicPropertiesController,
    PublicConfigController,
    MediaController,
  ],
  exports: [PropertiesService],
})
export class PropertiesModule {}
