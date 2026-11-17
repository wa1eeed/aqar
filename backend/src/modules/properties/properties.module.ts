import { Global, Module } from '@nestjs/common';
import { LocationsController } from '../locations/locations.controller';
import { SettingsModule } from '../settings/settings.module';
import { AdminPropertiesController } from './admin-properties.controller';
import { PropertiesService } from './properties.service';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [AdminPropertiesController, LocationsController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
