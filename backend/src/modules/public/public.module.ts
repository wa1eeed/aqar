import { Module } from '@nestjs/common';
import { PublicLeadsService } from '../leads/public-leads';
import { BookingsCoreModule } from '../bookings/bookings.module';
import { SettingsModule } from '../settings/settings.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [SettingsModule, BookingsCoreModule],
  controllers: [PublicController],
  providers: [PublicService, PublicLeadsService],
})
export class PublicModule {}
