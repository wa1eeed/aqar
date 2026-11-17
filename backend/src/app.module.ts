import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from './common/auth/auth.guard';
import { correlationMiddleware } from './common/context/correlation.middleware';
import { jsonShapeMiddleware } from './common/http/json-shape.middleware';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { loggerParams } from './common/logging';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { CsrfGuard } from './common/security/csrf.guard';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env';
import { AuditModule } from './modules/audit/audit.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    SettingsModule,
    HealthModule,
  ],
  providers: [
    RateLimitService,
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: rate limit first (cheap rejection), then CSRF, then default-deny auth.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [RateLimitService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(correlationMiddleware, jsonShapeMiddleware).forRoutes('*');
  }
}
