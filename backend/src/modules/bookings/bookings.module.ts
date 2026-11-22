import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { BookingsService } from './bookings.service.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { FileStore } from './file-store.service.js';
import { ReceiptsService } from './receipts.service.js';
import { MeBookingsController } from './me-bookings.controller.js';
import { AdminBookingsController, AdminPaymentsController, BankAccountsController } from './admin.controller.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [AuthModule, SettingsModule],
  providers: [BookingsService, BankAccountsService, FileStore, ReceiptsService],
  controllers: [
    MeBookingsController,
    AdminBookingsController,
    AdminPaymentsController,
    BankAccountsController,
    WebhooksController,
  ],
  exports: [BookingsService, ReceiptsService],
})
export class BookingsModule {}
