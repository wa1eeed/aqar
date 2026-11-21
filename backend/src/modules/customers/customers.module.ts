import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MeService } from './me.service.js';
import { CustomersService } from './customers.service.js';
import { MeController } from './me.controller.js';
import { CustomersAdminController } from './customers.controller.js';

@Module({
  imports: [AuthModule],
  providers: [MeService, CustomersService],
  controllers: [MeController, CustomersAdminController],
  exports: [MeService, CustomersService],
})
export class CustomersModule {}
