import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FileStore } from '../payments/file-store.service';
import {
  AdminPaymentsController,
  MePaymentsController,
  MoyasarWebhookController,
} from '../payments/payments.controller';
import { PaymentsService } from '../payments/payments.service';
import { TransfersService } from '../payments/transfers.service';
import { BookingTransitions } from './booking-transitions';
import { AdminBookingsController, MeBookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

const providers = [BookingsService, BookingTransitions, PaymentsService, TransfersService, FileStore];

/** Bookings and payments services (API and worker). */
@Module({ imports: [SettingsModule], providers, exports: providers })
export class BookingsCoreModule {}

/** HTTP surface of bookings and payments (API only). */
@Module({
  imports: [BookingsCoreModule],
  controllers: [
    MeBookingsController,
    AdminBookingsController,
    MePaymentsController,
    AdminPaymentsController,
    MoyasarWebhookController,
  ],
})
export class BookingsModule {}
