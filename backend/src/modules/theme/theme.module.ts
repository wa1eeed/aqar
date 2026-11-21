import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { ThemeService } from './theme.service.js';
import { ThemeController } from './theme.controller.js';

@Module({
  imports: [SettingsModule],
  providers: [ThemeService],
  controllers: [ThemeController],
  exports: [ThemeService],
})
export class ThemeModule {}
