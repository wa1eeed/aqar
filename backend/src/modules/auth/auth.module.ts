import { Global, Module } from '@nestjs/common';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { SettingsModule } from '../settings/settings.module';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { KeyedHashService } from './keyed-hash.service';
import { SessionService } from './session.service';
import { StaffAuthService } from './staff-auth.service';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    SessionService,
    KeyedHashService,
    StaffAuthService,
    CustomerAuthService,
    AccessScopeService,
  ],
  exports: [
    AccessTokenService,
    SessionService,
    KeyedHashService,
    StaffAuthService,
    CustomerAuthService,
    AccessScopeService,
  ],
})
export class AuthModule {}
