import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BookingRules } from './booking-rules';
import { CrmJobsService } from './crm-jobs.service';
import { NotificationRules } from './notification-rules';
import { NotificationsService } from './notifications.service';

/** Notification pipeline + rules; used by the API and the worker (jobs). */
@Global()
@Module({
  imports: [SettingsModule],
  providers: [NotificationsService, NotificationRules, BookingRules, CrmJobsService],
  exports: [NotificationsService, CrmJobsService],
})
export class NotificationsCoreModule {}
