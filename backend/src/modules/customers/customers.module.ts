import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AdminCustomersController, MeController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [SettingsModule],
  controllers: [AdminCustomersController, MeController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
