import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsService } from './leads.service.js';
import { PublicLeadsController } from './public-leads.controller.js';
import { LeadsAdminController } from './leads.controller.js';

@Module({
  imports: [AuthModule],
  providers: [LeadsService],
  controllers: [PublicLeadsController, LeadsAdminController],
  exports: [LeadsService],
})
export class LeadsModule {}
