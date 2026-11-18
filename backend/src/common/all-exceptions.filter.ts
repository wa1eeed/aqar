import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    correlationId: string;
  };
}

const STATUS_CODE: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE',
  429: 'RATE_LIMITED',
  502: 'INTEGRATION_ERROR',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = req.correlationId ?? 'c_unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'حدث خطأ غير متوقع';
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODE[status] ?? 'ERROR';
      const payload = exception.getResponse();
      const isZod = exception.constructor?.name === 'ZodValidationException';
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        message = typeof obj.message === 'string' ? obj.message : exception.message;
        if (isZod || status === HttpStatus.BAD_REQUEST) {
          code = isZod ? 'VALIDATION_FAILED' : code;
          if (obj.errors) details = { fields: obj.errors };
          else if (Array.isArray(obj.message)) details = { fields: obj.message };
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${correlationId}] ${req.method} ${req.url} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      // لا نكشف تفاصيل الأخطاء الداخلية للعميل
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) message = 'حدث خطأ غير متوقع';
    }

    const body: ErrorEnvelope = { error: { code, message, details, correlationId } };
    res.status(status).json(body);
  }
}
