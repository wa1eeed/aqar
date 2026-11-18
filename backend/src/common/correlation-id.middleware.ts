import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_HEADER);
    const id = incoming && incoming.length > 0 && incoming.length <= 64
      ? incoming
      : `c_${randomBytes(8).toString('hex')}`;
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  }
}
