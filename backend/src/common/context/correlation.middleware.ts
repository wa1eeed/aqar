import type { NextFunction, Request, Response } from 'express';
import { correlationIdFrom, requestContext } from './request-context';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Opens the per-request context (correlation id, client ip, user agent) for logs, audit and errors. */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = correlationIdFrom(req.headers[CORRELATION_HEADER]);
  (req as Request & { id: string }).id = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  const ua = req.headers['user-agent'];
  requestContext.run(
    {
      correlationId,
      ip: req.ip ?? null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
      actor: null,
    },
    () => next(),
  );
}
