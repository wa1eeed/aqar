import { HttpException, type HttpStatus } from '@nestjs/common';

export interface ErrorBody {
  error: { code: string; message: string; details: Record<string, unknown>; correlationId: string };
}

/**
 * Business error with a stable machine code and an Arabic user-facing message (docs/02 §1).
 *   throw new AppException('BOOKING_PROPERTY_UNAVAILABLE', 409, 'العقار غير متاح للحجز حالياً');
 */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus | number,
    readonly messageAr: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super({ code, message: messageAr, details }, status);
  }
}

/** Default codes and Arabic messages per HTTP status. */
export const DEFAULT_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'الطلب غير صالح' },
  401: { code: 'UNAUTHENTICATED', message: 'يلزم تسجيل الدخول' },
  403: { code: 'FORBIDDEN', message: 'ليست لديك صلاحية لتنفيذ هذا الإجراء' },
  404: { code: 'NOT_FOUND', message: 'المورد المطلوب غير موجود' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'العملية غير مسموحة' },
  409: { code: 'CONFLICT', message: 'تعارض مع بيانات موجودة' },
  410: { code: 'GONE', message: 'لم يعد هذا المورد متاحاً' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'حجم البيانات المرسلة أكبر من المسموح' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'نوع المحتوى غير مدعوم' },
  422: { code: 'BUSINESS_RULE', message: 'لا يمكن تنفيذ العملية' },
  429: { code: 'RATE_LIMITED', message: 'عدد كبير من المحاولات، حاول لاحقاً' },
  500: { code: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع، حاول مرة أخرى' },
  502: { code: 'INTEGRATION_ERROR', message: 'تعذّر الاتصال بالخدمة الخارجية' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتاً' },
};
