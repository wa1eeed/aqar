import type { ZodTypeAny, z } from 'zod';

export type Category = 'maps' | 'places' | 'payments' | 'email' | 'storage' | 'government' | 'identity' | 'sms';

export const CATEGORY_LABELS: Record<Category, string> = {
  maps: 'الخرائط',
  places: 'الأماكن القريبة',
  payments: 'المدفوعات',
  email: 'البريد الإلكتروني',
  storage: 'التخزين',
  government: 'الجهات الحكومية',
  identity: 'الهوية الرقمية',
  sms: 'الرسائل النصية',
};

export interface UiHint {
  labelAr: string;
  helpAr?: string;
  placeholder?: string;
  type?: 'url' | 'text' | 'select' | 'number' | 'boolean' | 'textarea' | 'multiselect';
  optionsAr?: Record<string, string>;
}

export interface TestResult {
  ok: boolean;
  messageAr: string;
  details?: unknown;
}

/** One recorded HTTP exchange (redacted before it is stored). */
export interface HttpExchange {
  method: string;
  url: string;
  status?: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

/** Runtime context handed to provider code by the gateway. */
export interface ProviderCtx<C, S> {
  key: string;
  config: C;
  secrets: Partial<S>;
  environment: 'sandbox' | 'live';
  correlationId: string;
  signal: AbortSignal;
  /** fetch wrapper: applies the abort signal, correlation id header and records the exchange. */
  http(url: string, init?: RequestInit & { json?: unknown; form?: Record<string, string> }): Promise<HttpResponse>;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

/** docs/05 §2 — the admin form is generated from the two schemas + uiHints. */
export interface ProviderDefinition<C extends ZodTypeAny = ZodTypeAny, S extends ZodTypeAny = ZodTypeAny> {
  key: string;
  category: Category;
  nameAr: string;
  descriptionAr: string;
  docsUrl?: string;
  configSchema: C;
  secretsSchema: S;
  uiHints: Record<string, UiHint>;
  supportsSandbox: boolean;
  /** Enabled by default when seeded (maps.osm, places.overpass). */
  defaultEnabled?: boolean;
  /** "Prepared": adapter + screens exist, HTTP calls wait for the provider's partner documentation. */
  prepared?: boolean;
  webhookPath?: string;
  /** Default calls/minute (token bucket); config.rateLimitPerMin overrides. */
  rateLimitPerMin?: number;
  testConnection(ctx: ProviderCtx<z.output<C>, z.output<S>>): Promise<TestResult>;
}

export const PREPARED_MESSAGE = 'بانتظار بيانات الربط من الجهة المزوّدة';

export class IntegrationError extends Error {
  constructor(
    readonly code:
      | 'INTEGRATION_DISABLED'
      | 'INTEGRATION_NOT_CONFIGURED'
      | 'INTEGRATION_CIRCUIT_OPEN'
      | 'INTEGRATION_RATE_LIMITED'
      | 'INTEGRATION_TIMEOUT'
      | 'INTEGRATION_HTTP_ERROR'
      | 'INTEGRATION_BAD_RESPONSE',
    message: string,
    readonly httpStatus?: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}
