/**
 * API client for the admin panel.
 * - Access token lives in memory only (never localStorage), refresh token in an httpOnly cookie.
 * - Every request sends `X-Requested-With: nx` (CSRF check for cookie endpoints, docs/10 §1).
 * - 401 → one silent refresh then retry; REAUTH_REQUIRED → ask the user to confirm identity, retry.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** Field → message code map for VALIDATION_FAILED. */
  get fields(): Record<string, string> {
    return (this.details.fields as Record<string, string> | undefined) ?? {};
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let reauthHandler: (() => Promise<boolean>) | null = null;
let onSessionLost: (() => void) | null = null;

export const tokenStore = {
  set(t: string | null) {
    accessToken = t;
  },
  get: () => accessToken,
};

export function setReauthHandler(fn: (() => Promise<boolean>) | null) {
  reauthHandler = fn;
}
export function setSessionLostHandler(fn: (() => void) | null) {
  onSessionLost = fn;
}

// تعدّد المستأجرين: في التطوير المحلي نرسل X-Tenant للمشترك الافتراضي حتى يحلّ الخادم
// سياق المكتب (موظفوه مرتبطون بمستأجر). في الإنتاج يُحلّ المشترك من نطاق المكتب، فلا يلزم.
const DEV_TENANT =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'demo'
    : null;

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'nx');
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (DEV_TENANT) headers.set('X-Tenant', DEV_TENANT);
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code: string; message: string; details?: Record<string, unknown> } };
    if (body.error) return new ApiError(res.status, body.error.code, body.error.message, body.error.details ?? {});
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم، حاول مرة أخرى');
}

/** Rotates the refresh cookie and stores a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'nx', 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: 'staff' }),
      });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      accessToken = ((await res.json()) as { accessToken: string }).accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; retry?: boolean; blob?: boolean } = {},
): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST') };
  if (opts.body !== undefined) init.body = opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);

  let res: Response;
  try {
    res = await raw(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم، تحقق من الإنترنت');
  }

  if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/')) {
    const err = await toError(res);
    if (err.code === 'REAUTH_REQUIRED' && reauthHandler) {
      if (await reauthHandler()) return api<T>(path, { ...opts, retry: false });
      throw err;
    }
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
    onSessionLost?.();
    throw err;
  }
  // At most one retry per call: anything still failing is returned to the caller.
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  if (opts.blob) return (await res.blob()) as T;
  return (await res.json()) as T;
}

/** Downloads a file endpoint (CSV/JSON exports) through the same auth/re-auth handling. */
export async function download(path: string, filename: string): Promise<void> {
  const blob = await api<Blob>(path, { blob: true });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Arabic messages for validation codes returned by the API. */
export const FIELD_MESSAGES: Record<string, string> = {
  password_too_short: 'كلمة المرور يجب ألا تقل عن 12 حرفاً',
  password_too_long: 'كلمة المرور طويلة جداً',
  password_too_common: 'كلمة المرور شائعة جداً، اختر غيرها',
  password_too_simple: 'كلمة المرور بسيطة جداً، نوّع الأحرف',
  password_contains_email: 'لا تستخدم اسم بريدك داخل كلمة المرور',
  invalid_email: 'البريد الإلكتروني غير صحيح',
  invalid_phone: 'رقم الجوال غير صحيح (05XXXXXXXX)',
  invalid_number: 'الرقم غير صحيح',
  Required: 'حقل إلزامي',
  unknown_agent: 'المستشار غير موجود',
  district_not_in_city: 'الحي لا يتبع المدينة المختارة',
  offer_not_allowed_for_type: 'نوع العرض غير متاح لهذا النوع من العقارات',
  rent_period_mismatch: 'مدة الإيجار مطلوبة للإيجار فقط',
  status_not_allowed_for_offer: 'الحالة غير متاحة لنوع العرض',
};

/** zod's default English messages → Arabic (the API returns them verbatim for generic rules). */
const ZOD_PATTERNS: Array<[RegExp, (n: string) => string]> = [
  [/^String must contain at least (\d+) character/, (n) => `يجب ألا يقل عن ${n} أحرف`],
  [/^String must contain at most (\d+) character/, (n) => `يجب ألا يزيد عن ${n} حرفاً`],
  [/^Number must be greater than or equal to (-?[\d.]+)/, (n) => `يجب ألا تقل القيمة عن ${n}`],
  [/^Number must be less than or equal to (-?[\d.]+)/, (n) => `يجب ألا تزيد القيمة عن ${n}`],
  [/^Number must be greater than (-?[\d.]+)/, (n) => `يجب أن تكون القيمة أكبر من ${n}`],
  [/^Array must contain at most (\d+) element/, (n) => `الحد الأقصى ${n} عناصر`],
  [/^Expected number/, () => 'الرقم غير صحيح'],
  [/^Invalid enum value/, () => 'اختر قيمة من القائمة'],
];

export function fieldMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const known = FIELD_MESSAGES[code];
  if (known) return known;
  for (const [re, fmt] of ZOD_PATTERNS) {
    const m = re.exec(code);
    if (m) return fmt(m[1] ?? '');
  }
  return 'قيمة غير صحيحة';
}
