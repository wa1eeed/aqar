import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { requestContext } from '../context/request-context';
import { AppException, DEFAULT_ERRORS, type ErrorBody } from './app-exception';

interface Normalised {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function byStatus(status: number): Normalised {
  const d = DEFAULT_ERRORS[status] ?? DEFAULT_ERRORS[status >= 500 ? 500 : 400]!;
  return { status, code: d.code, message: d.message, details: {} };
}

/**
 * Single error shape for every endpoint (docs/02 §1). Internal details (stack traces, SQL, provider
 * responses) are logged with the correlation id but never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const n = this.normalise(exception);
    const correlationId = requestContext.correlationId();

    if (n.status >= 500) {
      this.logger.error({ err: exception, correlationId }, 'request failed');
    }
    if (n.status === 429 && typeof n.details.retryAfterSec === 'number') {
      res.setHeader('Retry-After', String(n.details.retryAfterSec));
    }
    if (res.headersSent) return;
    const body: ErrorBody = { error: { code: n.code, message: n.message, details: n.details, correlationId } };
    res.status(n.status).json(body);
  }

  private normalise(e: unknown): Normalised {
    if (e instanceof AppException) {
      return { status: e.getStatus(), code: e.code, message: e.messageAr, details: e.details };
    }
    if (e instanceof ZodValidationException) {
      return {
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'البيانات المدخلة غير صحيحة',
        details: { fields: zodFields(e.getZodError()) },
      };
    }
    if (e instanceof ZodError) {
      return {
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'البيانات المدخلة غير صحيحة',
        details: { fields: zodFields(e) },
      };
    }
    if (e instanceof HttpException) {
      return byStatus(e.getStatus());
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return byStatus(409);
      if (e.code === 'P2025') return byStatus(404);
      return byStatus(500);
    }
    // Errors raised by body-parser before Nest sees the request.
    const parserError = e as { type?: string; status?: number } | null;
    if (parserError?.type === 'entity.parse.failed') {
      return { status: 400, code: 'INVALID_JSON', message: 'صيغة البيانات المرسلة غير صحيحة', details: {} };
    }
    if (parserError?.type === 'entity.too.large') return byStatus(413);
    if (parserError?.type === 'charset.unsupported' || parserError?.type === 'encoding.unsupported')
      return byStatus(415);
    return byStatus(500);
  }
}
