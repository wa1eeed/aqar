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
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MediaModule } from './modules/media/media.module';
import { NearbyModule } from './modules/nearby/nearby.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { PublicModule } from './modules/public/public.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { QueueModule } from './queue/queue.module';
import { LeadsModule } from './modules/leads/leads.module';
import { CustomersModule } from './modules/customers/customers.module';
import { StaffModule } from './modules/staff/staff.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsApiModule } from './modules/notifications/notifications-api.module';
import { NotificationsCoreModule } from './modules/notifications/notifications.module';
import { RealtimeCoreModule } from './modules/realtime/realtime.service';
import { RealtimeModule } from './modules/realtime/realtime.module';
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
    QueueModule,
    RealtimeCoreModule,
    IntegrationsModule,
    EmailModule,
    AuthModule,
    NotificationsCoreModule,
    RealtimeModule,
    NotificationsApiModule,
    StaffModule,
    LeadsModule,
    CustomersModule,
    PropertiesModule,
    MediaModule,
    PublicModule,
    NearbyModule,
    WebhooksModule,
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
