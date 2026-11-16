import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';
import { requestContext } from './context/request-context';

/** Pino JSON logs with correlation id; credentials and cookies are never written (docs/10 §5). */
export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req) => (req as { id?: string }).id ?? requestContext.correlationId(),
      customProps: () => ({ correlationId: requestContext.get()?.correlationId }),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
          '*.secret',
          '*.apiKey',
          '*.code',
        ],
        censor: '••••',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' || req.url === '/api/v1/ready' },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  };
}
