import { Module } from '@nestjs/common';
import { AdminNotificationsController, MeNotificationsController } from './notifications.controller';

@Module({ controllers: [AdminNotificationsController, MeNotificationsController] })
export class NotificationsApiModule {}
