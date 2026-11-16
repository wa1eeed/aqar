import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { Public } from '../src/common/auth/public.decorator';
import { RateLimit } from '../src/common/rate-limit/rate-limit.decorator';
import { RequireCsrfHeader } from '../src/common/security/csrf.guard';

class EchoDto extends createZodDto(
  z.object({ name: z.string().min(2), phone: z.string().regex(/^05\d{8}$/) }).strict(),
) {}

/** Routes that exist only in tests, to exercise the global guards/pipes/filters. */
@Controller('test')
export class TestController {
  @Public()
  @Post('echo')
  echo(@Body() body: EchoDto) {
    return { ok: true, body, amount: 123n };
  }

  @Get('private')
  private() {
    return { secret: true };
  }

  @Public()
  @RequireCsrfHeader()
  @Post('csrf')
  csrf() {
    return { ok: true };
  }

  @Public()
  @Get('boom')
  boom() {
    throw new Error('relation "StaffUser" does not exist — password=hunter2');
  }

  @Public()
  @RateLimit({ name: 'test-limited', limit: 3, windowSec: 60, by: 'ip' })
  @Get('limited')
  limited() {
    return { ok: true };
  }

  @Public()
  @RateLimit({ name: 'test-otp', limit: 2, windowSec: 60, by: 'body:destination', failClosed: true })
  @Post('otp')
  otp() {
    return { ok: true };
  }
}

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [TestController] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true, rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}
