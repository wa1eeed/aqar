import type { ZodTypeAny } from 'zod';

export type IntegrationCategory =
  | 'maps'
  | 'places'
  | 'payments'
  | 'email'
  | 'storage'
  | 'government'
  | 'identity'
  | 'sms';

/** نطاق التكامل: منصّي (مشترك للجميع) أو لكل مشترك (docs/12 §6). */
export type ProviderScope = 'platform' | 'tenant';

export type UiFieldType = 'url' | 'text' | 'select' | 'number' | 'boolean' | 'textarea' | 'password';

export interface UiHint {
  labelAr: string;
  helpAr?: string;
  placeholder?: string;
  type?: UiFieldType;
  options?: { value: string; labelAr: string }[];
}

export interface ProviderCtx<C, S> {
  config: C;
  secrets: S;
  environment: 'sandbox' | 'live';
  correlationId?: string;
}

export interface TestResult {
  ok: boolean;
  messageAr: string;
  details?: unknown;
}

/**
 * تعريف مزوّد: تُولَّد منه شاشة الإدارة تلقائياً (configSchema + secretsSchema + uiHints).
 * مزوّد جديد يظهر في الإدارة بلا كود واجهة (docs/05 §2).
 */
export interface ProviderDefinition<C = unknown, S = unknown> {
  key: string;
  category: IntegrationCategory;
  scope: ProviderScope;
  nameAr: string;
  descriptionAr: string;
  docsUrl?: string;
  configSchema: ZodTypeAny;
  secretsSchema: ZodTypeAny;
  uiHints: Record<string, UiHint>;
  supportsSandbox: boolean;
  webhookPath?: string;
  /** مزوّد "مُهيّأ": المخطّطات والشاشة موجودة، والاستدعاءات تُنفَّذ عند توفّر بيانات الربط. */
  prepared?: boolean;
  enabledByDefault?: boolean;
  testConnection(ctx: ProviderCtx<C, S>): Promise<TestResult>;
}

export const AWAITING_PARTNER: TestResult = {
  ok: false,
  messageAr: 'بانتظار بيانات الربط من الجهة المزوّدة',
};
