const BASE = '/api/v1';

// في التطوير: المشترك الافتراضي للوحة المكتب (يُستبدل بالمصادقة لاحقاً).
const DEV_TENANT = 'demo';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant': DEV_TENANT,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** لوحة المكتب (مُقيّدة بالمشترك عبر X-Tenant). */
export const officeApi = {
  settings: () => request<Record<string, unknown>>('/admin/settings'),
};

/** لوحة السوبر-أدمن (platform، بلا مشترك). */
export interface TenantRow {
  id: string;
  slug: string;
  code: string;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  createdAt: string;
}

export const platformApi = {
  tenants: () => request<TenantRow[]>('/super/tenants'),
};
