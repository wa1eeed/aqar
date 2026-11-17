import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { patchNestJsSwagger } from 'nestjs-zod';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { jsonReplacer } from './common/http/json';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

export const API_PREFIX = 'api/v1';

/** HTTP hardening shared by main.ts and the e2e tests, so tests exercise the real configuration. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(Logger));

  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.set('json replacer', jsonReplacer);
  // Client IP for rate limits and audit comes from X-Forwarded-For set by our own proxies only.
  express.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.setGlobalPrefix(API_PREFIX);
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });
  app.use(cookieParser());

  // The API only returns JSON: deny everything a browser could do with a response.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  // No CORS: frontend, admin and API share one origin (docs/10 §1).

  if (env.SWAGGER_ENABLED && env.NODE_ENV !== 'production') {
    patchNestJsSwagger();
    const config = new DocumentBuilder().setTitle('NX Real Estate API').setVersion('1').addBearerAuth().build();
    const doc = SwaggerModule.createDocument(app, config);
    // Swagger UI needs scripts/styles; relax CSP for that path only (non-production).
    app.use('/api/docs', helmet({ contentSecurityPolicy: false }));
    SwaggerModule.setup('api/docs', app, doc);
  }

  // Socket.IO at /ws with the Redis adapter (docs/02 §9).
  app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL));

  app.enableShutdownHooks();
  return app;
}
