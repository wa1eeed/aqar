import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { SettingsModule } from './modules/settings/settings.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
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
    StaffModule,
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
