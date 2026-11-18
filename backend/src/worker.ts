import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

// العامل الخلفي: يشارك نفس صورة الحاوية (node dist/worker.js).
// مستهلكات BullMQ (الوسائط، الإشعارات، المزامنة، انتهاء الحجوزات) تُضاف في المراحل اللاحقة.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  Logger.log('العامل الخلفي يعمل — بانتظار المهام (تُضاف مستهلكات BullMQ لاحقاً)', 'Worker');
}

void bootstrap();
