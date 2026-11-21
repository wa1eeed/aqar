import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [BookingsModule],
  providers: [JobsService],
})
export class JobsModule {}
