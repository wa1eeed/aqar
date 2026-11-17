# Error codes

> **Generated** by `pnpm docs` from the source code — do not edit by hand.
> Regenerate after any change; CI runs `pnpm docs:check`.

Every error has the shape `{ "error": { "code", "message", "details", "correlationId" } }` (docs/02 §1).
`VALIDATION_FAILED` carries `details.fields` (field → message code). Messages are Arabic and safe to show.
Generic codes returned by the exception filter for framework errors (by HTTP status), plus
`VALIDATION_FAILED` (400) for DTO validation and `INVALID_JSON` (400) for malformed bodies:

| HTTP | Code | Message |
|---|---|---|
| 400 | `BAD_REQUEST` | الطلب غير صالح |
| 401 | `UNAUTHENTICATED` | يلزم تسجيل الدخول |
| 403 | `FORBIDDEN` | ليست لديك صلاحية لتنفيذ هذا الإجراء |
| 404 | `NOT_FOUND` | المورد المطلوب غير موجود |
| 405 | `METHOD_NOT_ALLOWED` | العملية غير مسموحة |
| 409 | `CONFLICT` | تعارض مع بيانات موجودة |
| 410 | `GONE` | لم يعد هذا المورد متاحاً |
| 413 | `PAYLOAD_TOO_LARGE` | حجم البيانات المرسلة أكبر من المسموح |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | نوع المحتوى غير مدعوم |
| 422 | `BUSINESS_RULE` | لا يمكن تنفيذ العملية |
| 429 | `RATE_LIMITED` | عدد كبير من المحاولات، حاول لاحقاً |
| 500 | `INTERNAL_ERROR` | حدث خطأ غير متوقع، حاول مرة أخرى |
| 502 | `INTEGRATION_ERROR` | تعذّر الاتصال بالخدمة الخارجية |
| 503 | `SERVICE_UNAVAILABLE` | الخدمة غير متاحة مؤقتاً |

Codes thrown by the application:

| Code | HTTP | Example message | Thrown in |
|---|---|---|---|
| `ACCOUNT_BLOCKED` | 403 | هذا الحساب غير متاح، تواصل معنا للمساعدة | modules/auth/customer-auth.service.ts |
| `ACCOUNT_LOCKED` | 429 | تم إيقاف الدخول مؤقتاً بسبب محاولات متكررة، حاول بعد 15 دقيقة | modules/auth/customer-auth.service.ts<br>modules/auth/staff-auth.service.ts |
| `ALREADY_ACTIVE` | 409 | العضو سجّل الدخول من قبل | modules/staff/staff.service.ts |
| `ALREADY_ENABLED` | 409 | التحقق بخطوتين مفعّل بالفعل | modules/auth/staff-auth.service.ts |
| `BOOKING_PROPERTY_UNAVAILABLE` | 409 | العقار غير متاح للحجز حالياً | common/errors/app-exception.ts |
| `CHALLENGE_EXPIRED` | 401 | انتهت صلاحية جلسة الدخول، سجّل الدخول من جديد | modules/auth/staff-auth.service.ts |
| `CONFIRM_LIVE_REQUIRED` | 422 | التبديل إلى البيئة المباشرة يتطلب تأكيداً | modules/integrations/admin-integrations.controller.ts |
| `CONFLICT` | 409 | رقم الجوال مستخدم في حساب آخر | modules/customers/customers.service.ts<br>modules/locations/locations.controller.ts |
| `CSRF_CHECK_FAILED` | 403 | تعذّر التحقق من مصدر الطلب | common/security/csrf.guard.ts |
| `CUSTOMER_DELETED` | 422 | الحساب محذوف بطلب من العميل | modules/customers/customers.service.ts |
| `EMAIL_IN_USE` | 409 | البريد الإلكتروني مستخدم لعضو آخر | modules/staff/staff.service.ts |
| `FEATURE_DISABLED` | 404 | الميزة غير مفعّلة | modules/customers/customers.service.ts |
| `FORBIDDEN` | 403 | ليست لديك صلاحية لتنفيذ هذا الإجراء | common/auth/auth.guard.ts<br>modules/leads/assignees.controller.ts<br>modules/leads/leads.service.ts<br>modules/media/media.service.ts<br>modules/properties/properties.service.ts<br>modules/settings/settings.controller.ts<br>modules/staff/staff.service.ts |
| `INVALID_CODE` | 401 | الرمز غير صحيح أو منتهي الصلاحية | modules/auth/customer-auth.service.ts<br>modules/auth/staff-auth.service.ts<br>modules/customers/customers.service.ts |
| `INVALID_CREDENTIALS` | 401 | البريد الإلكتروني أو كلمة المرور غير صحيحة | modules/auth/customer-auth.service.ts<br>modules/auth/staff-auth.service.ts |
| `INVALID_SIGNATURE` | 401 | توقيع غير صالح | modules/webhooks/webhooks.controller.ts |
| `INVALID_TOKEN` | 400 | انتهت صلاحية التسجيل، أعد طلب الرمز | modules/auth/customer-auth.service.ts<br>modules/auth/staff-auth.service.ts |
| `LAST_OWNER` | 422 | لا يمكن إزالة آخر مالك للمنشأة | modules/staff/staff.service.ts |
| `LIMIT_REACHED` | 422 | الحد الأقصى ${MAX_FAVORITES} عقاراً في المفضلة | modules/customers/customers.service.ts |
| `MEDIA_LIMIT` | 422 | الحد الأقصى ${MAX_PHOTOS} صورة لكل عقار | modules/media/media.service.ts |
| `NOT_FOUND` | 404 | العميل غير موجود | modules/customers/customers.service.ts<br>modules/integrations/admin-integrations.controller.ts<br>modules/integrations/integration-store.service.ts<br>modules/leads/leads.service.ts<br>modules/leads/public-leads.ts<br>modules/locations/locations.controller.ts<br>modules/media/media.service.ts<br>modules/nearby/nearby.controller.ts<br>modules/nearby/nearby.service.ts<br>modules/properties/properties.service.ts<br>modules/public/public.controller.ts<br>modules/public/public.service.ts<br>modules/settings/settings.controller.ts<br>modules/settings/settings.service.ts<br>modules/staff/staff.service.ts<br>modules/viewings/viewings.service.ts |
| `PASSWORD_REUSED` | 422 | اختر كلمة مرور مختلفة عن الحالية | modules/auth/staff-auth.service.ts |
| `PAYLOAD_TOO_COMPLEX` | 413 | حجم البيانات المرسلة أكبر من المسموح | common/http/json-shape.middleware.ts |
| `PAYLOAD_TOO_LARGE` | 413 | حجم الصورة يجب ألا يتجاوز 15 ميجابايت | modules/media/media.service.ts |
| `PHONE_IN_USE` | 409 | رقم الجوال مسجّل في حساب آخر | modules/auth/customer-auth.service.ts |
| `PROVIDER_NOT_READY` | 422 | هذا التكامل بانتظار بيانات الربط من الجهة المزوّدة | modules/integrations/integration-store.service.ts<br>modules/properties/admin-properties.controller.ts |
| `RATE_LIMITED` | 429 | عدد كبير من المحاولات، حاول لاحقاً | common/rate-limit/rate-limit.guard.ts |
| `REAUTH_REQUIRED` | 401 | يلزم تأكيد هويتك مرة أخرى لإتمام هذا الإجراء | common/auth/auth.guard.ts<br>modules/integrations/admin-integrations.controller.ts<br>modules/settings/settings.controller.ts |
| `SERVICE_UNAVAILABLE` | 503 | الخدمة غير متاحة مؤقتاً | common/rate-limit/rate-limit.guard.ts |
| `SESSION_EXPIRED` | 401 | انتهت الجلسة، سجّل الدخول من جديد | modules/auth/auth.controller.ts<br>modules/auth/customer-auth.service.ts<br>modules/auth/staff-auth.service.ts |
| `SMS_NOT_AVAILABLE` | 422 | الدخول برسالة نصية غير متاح حالياً، استخدم البريد الإلكتروني | modules/auth/customer-auth.service.ts |
| `STORAGE_NOT_CONFIGURED` | 422 | فعّل تكامل التخزين (Cloudflare R2) أولاً من صفحة التكاملات | modules/media/media.service.ts |
| `SYSTEM_ROLE` | 422 | أدوار النظام لا يمكن تعديلها | modules/staff/staff.service.ts |
| `TOO_MANY_ATTEMPTS` | 429 | محاولات كثيرة غير صحيحة، سجّل الدخول من جديد | modules/auth/staff-auth.service.ts |
| `UNAUTHENTICATED` | 401 | يلزم تسجيل الدخول | common/auth/auth.guard.ts<br>modules/customers/customers.service.ts |
| `VALIDATION_FAILED` | 400 | البيانات المدخلة غير صحيحة | modules/auth/customer-auth.service.ts<br>modules/integrations/integration-store.service.ts<br>modules/leads/leads.service.ts<br>modules/leads/public-leads.ts<br>modules/media/media.service.ts<br>modules/notifications/notifications.controller.ts<br>modules/properties/properties.service.ts<br>modules/staff/staff.service.ts<br>modules/viewings/viewings.service.ts |
| `VIEWING_CONFLICT` | 409 | لدى المستشار موعد آخر في هذا الوقت | modules/viewings/viewings.service.ts |
| `VIEWING_NOT_CANCELLABLE` | 422 | لا يمكن إلغاء هذا الموعد | modules/customers/customers.service.ts |
| `WRONG_STEP` | 409 | خطوة الدخول غير متوقعة | modules/auth/staff-auth.service.ts |
