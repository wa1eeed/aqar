import { Global, Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { PlatformIntegrationsController } from './platform-integrations.controller.js';

// البوابة المركزية لكل الاتصالات الخارجية (docs/05). عالمية ليستعملها بقيّة الوحدات.
@Global()
@Module({
  providers: [IntegrationsService],
  controllers: [IntegrationsController, PlatformIntegrationsController],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
