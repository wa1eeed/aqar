import { Module } from '@nestjs/common';
import { FileStore } from '../payments/file-store.service';
import { SettingsModule } from '../settings/settings.module';
import { BrandAssetsController, ThemeController } from './theme.controller';
import { ThemeService } from './theme.service';

/** Branding & theme (docs/07 §10.1): /theme.css, /site.webmanifest, /brand/*, brand uploads. */
@Module({
  imports: [SettingsModule],
  controllers: [ThemeController, BrandAssetsController],
  providers: [ThemeService, FileStore],
  exports: [ThemeService],
})
export class ThemeModule {}
