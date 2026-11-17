import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { EmailService } from './email.service';

@Global()
@Module({ imports: [SettingsModule], providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
