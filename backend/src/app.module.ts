import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import type { Request } from 'express';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { EncryptionModule } from './common/crypto/encryption.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { TenantModule } from './common/tenant/tenant.module.js';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware.js';
import { TenantResolverMiddleware } from './common/tenant/tenant-resolver.middleware.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { EntitlementsModule } from './modules/entitlements/entitlements.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { LocationsModule } from './modules/locations/locations.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { ViewingsModule } from './modules/viewings/viewings.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { ThemeModule } from './modules/theme/theme.module.js';
import { SeoModule } from './modules/seo/seo.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        customProps: (req) => ({ correlationId: (req as Request).correlationId }),
      },
    }),
    TenantModule,
    PrismaModule,
    EncryptionModule,
    AuditModule,
    AuthModule,
    IntegrationsModule,
    EntitlementsModule,
    RealtimeModule,
    NotificationsModule,
    StaffModule,
    PropertiesModule,
    LocationsModule,
    LeadsModule,
    ViewingsModule,
    CustomersModule,
    BookingsModule,
    ThemeModule,
    SeoModule,
    ReportsModule,
    JobsModule,
    SettingsModule,
    HealthModule,
    PlatformModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // الترتيب مهم: correlation id ثم تحديد المشترك (يُشغّل بقيّة الطلب داخل TenantContext).
    consumer.apply(CorrelationIdMiddleware, TenantResolverMiddleware).forRoutes('*');
  }
}
