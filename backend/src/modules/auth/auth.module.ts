import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';
import { TokensService } from './tokens.service.js';
import { OtpService } from './otp.service.js';
import { StaffAuthService } from './staff-auth.service.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TotpService,
    TokensService,
    OtpService,
    StaffAuthService,
    PlatformAuthService,
    CustomerAuthService,
    // حُرّاس عالميون: المصادقة ثم التفويض (بالترتيب).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TokensService, PasswordService],
})
export class AuthModule {}
