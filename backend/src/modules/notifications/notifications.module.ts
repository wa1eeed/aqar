import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { AdminNotificationsController, CustomerNotificationsController } from './notifications.controller.js';

@Global()
@Module({
  providers: [NotificationsService],
  controllers: [AdminNotificationsController, CustomerNotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
