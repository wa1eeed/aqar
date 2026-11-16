import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule, Logger as PinoLogger } from 'nestjs-pino';
import { loggerParams } from './common/logging';
import { ConfigModule, ENV } from './config/config.module';
import { loadEnv, type Env } from './config/env';
import { AuditModule } from './modules/audit/audit.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/**
 * Background worker (same image as the API, `node dist/worker`). BullMQ processors for the queues in
 * docs/10 §6 are registered here as their phases land; Phase 0 boots, connects and shuts down cleanly.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    SettingsModule,
  ],
})
class WorkerModule {}

async function main(): Promise<void> {
  loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  new Logger('Worker').log('worker ready');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
