import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { IntegrationsGateway } from './gateway.service';
import { IntegrationStore } from './integration-store.service';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [AdminIntegrationsController],
  providers: [IntegrationStore, IntegrationsGateway],
  exports: [IntegrationStore, IntegrationsGateway],
})
export class IntegrationsModule {}

/** Gateway without HTTP controllers, for the worker process. */
@Global()
@Module({
  imports: [SettingsModule],
  providers: [IntegrationStore, IntegrationsGateway],
  exports: [IntegrationStore, IntegrationsGateway],
})
export class IntegrationsCoreModule {}
