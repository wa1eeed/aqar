import { Module } from '@nestjs/common';
import { ViewingsController } from '../viewings/viewings.controller';
import { ViewingsService } from '../viewings/viewings.service';
import { AssigneesController } from './assignees.controller';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/** CRM: leads + viewings (docs/07 §4–5). */
@Module({
  controllers: [LeadsController, ViewingsController, AssigneesController],
  providers: [LeadsService, ViewingsService],
})
export class LeadsModule {}
