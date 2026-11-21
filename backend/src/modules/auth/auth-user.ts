export type SubjectKind = 'staff' | 'customer' | 'platform';

/** حمولة الرمز (JWT) للمستخدم الحالي. */
export interface AuthUser {
  sub: string;
  typ: SubjectKind;
  /** معرّف المشترك للموظف/العميل؛ غير موجود للسوبر-أدمن. */
  tid?: string | null;
  /** مفتاح الدور (للموظف). */
  role?: string;
  /** صلاحيات الموظف. */
  perms?: string[];
  /** يلزم إعداد 2FA (أدوار owner/admin/finance عند أول دخول). */
  mustSetup2fa?: boolean;
}
