import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { plainText } from '../../../common/security/zod-helpers';
import type { ProviderCtx, ProviderDefinition } from '../types';
import { IntegrationError } from '../types';
import { optionalUrl, rateLimit, secret } from './common';

export const moyasarConfig = z
  .object({
    mode: z.enum(['invoice', 'embedded_form']).default('invoice'),
    sources: z
      .array(z.enum(['creditcard', 'applepay', 'stcpay']))
      .max(3)
      .default(['creditcard', 'applepay']),
    callbackBaseUrl: optionalUrl,
    statementDescriptor: plainText(40).default(''),
    rateLimitPerMin: rateLimit,
  })
  .strict();
export const moyasarSecrets = z
  .object({
    secretKey: secret().refine((v) => /^sk_(test|live)_/.test(v), 'invalid_key_format'),
    publishableKey: secret().refine((v) => /^pk_(test|live)_/.test(v), 'invalid_key_format'),
    webhookSecret: secret(),
  })
  .partial()
  .strict();

/** Payment flows land in Phase 5; Phase 2 provides the settings screen and the connection test. */
export const moyasarPayments: ProviderDefinition<typeof moyasarConfig, typeof moyasarSecrets> = {
  key: 'payments.moyasar',
  category: 'payments',
  nameAr: 'ميسر Moyasar',
  descriptionAr: 'مدى · فيزا · Apple Pay · STC Pay',
  docsUrl: 'https://docs.moyasar.com',
  configSchema: moyasarConfig,
  secretsSchema: moyasarSecrets,
  uiHints: {
    mode: {
      labelAr: 'طريقة العرض',
      type: 'select',
      optionsAr: { invoice: 'صفحة فاتورة ميسر (موصى به)', embedded_form: 'نموذج مضمّن في الموقع' },
    },
    sources: {
      labelAr: 'وسائل الدفع',
      type: 'multiselect',
      optionsAr: { creditcard: 'بطاقات ومدى', applepay: 'Apple Pay', stcpay: 'STC Pay' },
    },
    callbackBaseUrl: { labelAr: 'رابط العودة الأساسي', type: 'url' },
    statementDescriptor: { labelAr: 'الوصف في كشف الحساب' },
    secretKey: { labelAr: 'Secret Key' },
    publishableKey: { labelAr: 'Publishable Key' },
    webhookSecret: { labelAr: 'Webhook Secret' },
  },
  supportsSandbox: true,
  webhookPath: '/api/v1/webhooks/moyasar',
  async testConnection(ctx) {
    const key = ctx.secrets.secretKey;
    if (!key) return { ok: false, messageAr: 'أدخل المفتاح السري' };
    const expectLive = ctx.environment === 'live';
    if (key.startsWith('sk_live_') !== expectLive) {
      return {
        ok: false,
        messageAr: expectLive
          ? 'البيئة «مباشر» تتطلب مفتاحاً يبدأ بـ sk_live_'
          : 'البيئة «تجريبي» تتطلب مفتاحاً يبدأ بـ sk_test_',
      };
    }
    const res = await ctx.http('https://api.moyasar.com/v1/payments?page=1', {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
    });
    if (res.status === 401) return { ok: false, messageAr: 'المفتاح السري غير صالح' };
    return res.ok
      ? { ok: true, messageAr: 'تم الاتصال بنجاح' }
      : { ok: false, messageAr: `فشل الاتصال (${res.status})` };
  },
};

// ───────────── payment operations (docs/04 §5) ─────────────
// HTTP details live only here. Verified against docs.moyasar.com at implementation time; re-check
// with sandbox keys before go-live (docs/QUESTIONS.md #21).

const API = 'https://api.moyasar.com/v1';
type Ctx = ProviderCtx<z.output<typeof moyasarConfig>, z.output<typeof moyasarSecrets>>;

export type ProviderPaymentStatus = 'paid' | 'failed' | 'pending' | 'refunded';

export interface ProviderPayment {
  status: ProviderPaymentStatus;
  amount: bigint;
  currency: string;
  /** Moyasar payment id (needed for refunds); for invoices, the paid payment inside the invoice. */
  paymentId: string | null;
  metadata: Record<string, string>;
  /** Short, non-sensitive summary for PaymentEvent / admin (no card data). */
  summary: Record<string, unknown>;
}

function auth(ctx: Ctx): Record<string, string> {
  const key = ctx.secrets.secretKey;
  if (!key) throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'moyasar secret key missing');
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
}

async function body<T>(res: { ok: boolean; status: number; json<U>(): Promise<U> }, what: string): Promise<T> {
  if (!res.ok) {
    throw new IntegrationError(
      'INTEGRATION_HTTP_ERROR',
      `moyasar ${what} failed (${res.status})`,
      res.status,
      res.status >= 500 || res.status === 429,
    );
  }
  try {
    return await res.json<T>();
  } catch {
    throw new IntegrationError('INTEGRATION_BAD_RESPONSE', `moyasar ${what}: invalid JSON`);
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const meta = (v: unknown): Record<string, string> =>
  v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x ?? '')]))
    : {};

function paymentStatus(s: string): ProviderPaymentStatus {
  if (s === 'paid' || s === 'captured') return 'paid';
  if (s === 'refunded') return 'refunded';
  if (s === 'failed' || s === 'voided' || s === 'canceled' || s === 'expired') return 'failed';
  return 'pending'; // initiated, authorized, on_hold…
}

interface MoyasarPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  invoice_id?: string | null;
  source?: { type?: string; company?: string };
}
interface MoyasarInvoice {
  id: string;
  status: string;
  amount: number;
  currency: string;
  url?: string;
  metadata?: Record<string, unknown>;
  payments?: MoyasarPayment[];
}

/** Hosted invoice page (mode «invoice»). */
export async function moyasarCreateInvoice(
  ctx: Ctx,
  p: {
    amount: bigint;
    descriptionAr: string;
    successUrl: string;
    backUrl: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  },
): Promise<{ invoiceId: string; url: string }> {
  const res = await ctx.http(`${API}/invoices`, {
    method: 'POST',
    headers: auth(ctx),
    json: {
      amount: Number(p.amount),
      currency: 'SAR',
      description: p.descriptionAr.slice(0, 255),
      success_url: p.successUrl,
      back_url: p.backUrl,
      callback_url: p.callbackUrl,
      metadata: p.metadata,
    },
  });
  const inv = await body<MoyasarInvoice>(res, 'create invoice');
  if (!inv.id || !inv.url) throw new IntegrationError('INTEGRATION_BAD_RESPONSE', 'moyasar invoice without url');
  return { invoiceId: inv.id, url: inv.url };
}

export async function moyasarFetchInvoice(ctx: Ctx, invoiceId: string): Promise<ProviderPayment> {
  const res = await ctx.http(`${API}/invoices/${encodeURIComponent(invoiceId)}`, { headers: auth(ctx) });
  const inv = await body<MoyasarInvoice>(res, 'fetch invoice');
  const paid = (inv.payments ?? []).find((x) => paymentStatus(x.status) === 'paid') ?? null;
  return {
    status: paymentStatus(inv.status),
    amount: BigInt(Math.round(Number(inv.amount))),
    currency: str(inv.currency).toUpperCase(),
    paymentId: paid?.id ?? null,
    metadata: meta(inv.metadata),
    summary: {
      invoiceId: inv.id,
      invoiceStatus: inv.status,
      paymentId: paid?.id ?? null,
      source: paid?.source?.type ?? null,
    },
  };
}

export async function moyasarFetchPayment(ctx: Ctx, paymentId: string): Promise<ProviderPayment> {
  const res = await ctx.http(`${API}/payments/${encodeURIComponent(paymentId)}`, { headers: auth(ctx) });
  const pay = await body<MoyasarPayment>(res, 'fetch payment');
  return {
    status: paymentStatus(pay.status),
    amount: BigInt(Math.round(Number(pay.amount))),
    currency: str(pay.currency).toUpperCase(),
    paymentId: pay.id,
    metadata: meta(pay.metadata),
    summary: {
      paymentId: pay.id,
      status: pay.status,
      source: pay.source?.type ?? null,
      company: pay.source?.company ?? null,
    },
  };
}

/** Full or partial refund (halalas). */
export async function moyasarRefund(ctx: Ctx, paymentId: string, amount: bigint): Promise<{ status: string }> {
  const res = await ctx.http(`${API}/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    headers: auth(ctx),
    json: { amount: Number(amount) },
  });
  const pay = await body<MoyasarPayment>(res, 'refund');
  return { status: pay.status };
}

/**
 * Moyasar webhooks carry the shared `secret_token` configured in the dashboard; compare in constant
 * time. Returns the event id/type and the payment object.
 */
export function moyasarVerifyWebhook(
  secretToken: string | undefined,
  payload: unknown,
): { valid: boolean; externalId: string; type: string; payment: MoyasarPayment | null } {
  const b = (payload ?? {}) as { id?: unknown; type?: unknown; secret_token?: unknown; data?: unknown };
  const given = Buffer.from(str(b.secret_token));
  const expected = Buffer.from(secretToken ?? '');
  const valid = !!secretToken && given.length === expected.length && timingSafeEqual(given, expected);
  const data = b.data && typeof b.data === 'object' ? (b.data as MoyasarPayment) : null;
  return { valid, externalId: str(b.id).slice(0, 100), type: str(b.type).slice(0, 60), payment: data };
}
