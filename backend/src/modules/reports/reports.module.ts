import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReportsService } from './reports.service.js';
import { ReportsController, AuditController, SystemController } from './reports.controller.js';

@Module({
  imports: [AuthModule],
  providers: [ReportsService],
  controllers: [ReportsController, AuditController, SystemController],
})
export class ReportsModule {}
