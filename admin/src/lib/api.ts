import { getAuth, setToken, type AuthUser } from './auth';

const BASE = '/api/v1';
// في التطوير المحلي: المشترك الافتراضي للوحة المكتب (في الإنتاج يُحلّ من النطاق).
const DEV_TENANT =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'demo' : null;

interface Options {
  method?: string;
  body?: unknown;
  tenantScoped?: boolean; // نقاط المكتب تحتاج X-Tenant في التطوير
}

async function raw<T>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const { token, scope } = getAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (DEV_TENANT && (opts.tenantScoped ?? scope === 'staff')) headers['X-Tenant'] = DEV_TENANT;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && retry && token) {
    // محاولة تحديث الرمز مرّة واحدة
    const refreshed = await tryRefresh();
    if (refreshed) return raw<T>(path, opts, false);
    setToken(null, null);
    throw new Error('انتهت الجلسة');
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: { message?: string } };
      if (b.error?.message) message = b.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    setToken(data.accessToken, getAuth().scope);
    return true;
  } catch {
    return false;
  }
}

type LoginResult = { twoFactorRequired: true; challengeId: string } | { accessToken: string; user: AuthUser };

export const api = {
  get: <T>(path: string, tenantScoped?: boolean) => raw<T>(path, { tenantScoped }),
  post: <T>(path: string, body?: unknown, tenantScoped?: boolean) => raw<T>(path, { method: 'POST', body, tenantScoped }),
  put: <T>(path: string, body?: unknown, tenantScoped?: boolean) => raw<T>(path, { method: 'PUT', body, tenantScoped }),
  patch: <T>(path: string, body?: unknown, tenantScoped?: boolean) => raw<T>(path, { method: 'PATCH', body, tenantScoped }),
  del: <T>(path: string, tenantScoped?: boolean) => raw<T>(path, { method: 'DELETE', tenantScoped }),
};

export const auth = {
  staffLogin: (email: string, password: string) =>
    raw<LoginResult>('/auth/staff/login', { method: 'POST', body: { email, password }, tenantScoped: true }),
  staff2fa: (challengeId: string, code: string) =>
    raw<LoginResult>('/auth/staff/2fa', { method: 'POST', body: { challengeId, code }, tenantScoped: true }),
  platformLogin: (email: string, password: string) =>
    raw<LoginResult>('/auth/platform/login', { method: 'POST', body: { email, password } }),
  platform2fa: (challengeId: string, code: string) =>
    raw<LoginResult>('/auth/platform/2fa', { method: 'POST', body: { challengeId, code } }),
  me: () => raw<AuthUser>('/auth/me'),
  logout: () => raw<void>('/auth/logout', { method: 'POST' }),
};
