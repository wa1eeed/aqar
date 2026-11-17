import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { NearbyController } from './nearby.controller';
import { NearbyService } from './nearby.service';

@Module({
  imports: [SettingsModule],
  controllers: [NearbyController],
  providers: [NearbyService],
  exports: [NearbyService],
})
export class NearbyModule {}
