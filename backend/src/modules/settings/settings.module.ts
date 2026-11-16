import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/** Admin endpoints (`/admin/settings/:section`) are added with staff auth in Phase 1. */
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
