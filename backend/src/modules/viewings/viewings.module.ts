import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ViewingsService } from './viewings.service.js';
import { ViewingsAdminController, CustomerViewingsController } from './viewings.controller.js';

@Module({
  imports: [AuthModule],
  providers: [ViewingsService],
  controllers: [ViewingsAdminController, CustomerViewingsController],
  exports: [ViewingsService],
})
export class ViewingsModule {}
