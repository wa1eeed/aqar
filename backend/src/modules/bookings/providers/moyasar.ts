import type { CheckoutParams, CheckoutResult, FetchResult, WebhookInput, WebhookResult } from './payment-provider.js';

// محوّل Moyasar (وضع الفاتورة). تحقّق من تفاصيل HTTP مقابل https://docs.moyasar.com عند التفعيل.
const BASE = 'https://api.moyasar.com/v1';

export interface MoyasarCtx {
  config: { mode?: 'invoice' | 'embedded_form'; callbackBaseUrl?: string };
  secrets: { secretKey: string; publishableKey?: string; webhookSecret?: string };
}

function auth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

function mapStatus(s: string): FetchResult['status'] {
  if (s === 'paid') return 'paid';
  if (s === 'initiated' || s === 'pending') return 'pending';
  if (s === 'refunded') return 'refunded';
  return 'failed';
}

export async function moyasarCreateCheckout(ctx: MoyasarCtx, p: CheckoutParams): Promise<CheckoutResult> {
  if (ctx.config.mode === 'embedded_form') {
    // النموذج المضمّن: بطاقة العميل لا تمرّ بخادمنا؛ الواجهة تنشئ الدفع ثم callback → reconcile
    return {
      formConfig: {
        publishableKey: ctx.secrets.publishableKey,
        amount: Number(p.amount),
        currency: 'SAR',
        description: p.descriptionAr,
        callbackUrl: p.callbackUrl,
        metadata: p.metadata,
      },
    };
  }
  const res = await fetch(`${BASE}/invoices`, {
    method: 'POST',
    headers: { Authorization: auth(ctx.secrets.secretKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Number(p.amount),
      currency: 'SAR',
      description: p.descriptionAr,
      callback_url: p.callbackUrl,
      metadata: p.metadata,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Moyasar invoice failed: HTTP ${res.status}`);
  const inv = (await res.json()) as { id: string; url: string };
  return { providerId: inv.id, url: inv.url };
}

export async function moyasarFetchInvoice(ctx: MoyasarCtx, invoiceId: string): Promise<FetchResult> {
  const res = await fetch(`${BASE}/invoices/${invoiceId}`, {
    headers: { Authorization: auth(ctx.secrets.secretKey) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Moyasar fetch failed: HTTP ${res.status}`);
  const inv = (await res.json()) as {
    status: string;
    amount: number;
    currency: string;
    payments?: { id: string; status: string }[];
  };
  const paid = inv.payments?.find((x) => x.status === 'paid') ?? inv.payments?.[0];
  return {
    status: mapStatus(inv.status),
    amount: BigInt(inv.amount),
    currency: inv.currency,
    providerPaymentId: paid?.id,
    raw: inv,
  };
}

export async function moyasarFetchPayment(ctx: MoyasarCtx, paymentId: string): Promise<FetchResult> {
  const res = await fetch(`${BASE}/payments/${paymentId}`, {
    headers: { Authorization: auth(ctx.secrets.secretKey) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Moyasar fetch failed: HTTP ${res.status}`);
  const pay = (await res.json()) as { id: string; status: string; amount: number; currency: string };
  return { status: mapStatus(pay.status), amount: BigInt(pay.amount), currency: pay.currency, providerPaymentId: pay.id, raw: pay };
}

export async function moyasarRefund(ctx: MoyasarCtx, paymentId: string, amount: bigint) {
  const res = await fetch(`${BASE}/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { Authorization: auth(ctx.secrets.secretKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Number(amount) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Moyasar refund failed: HTTP ${res.status}`);
  return { status: 'refunded', raw: await res.json() };
}

export function moyasarVerifyWebhook(input: WebhookInput): WebhookResult {
  const body = input.body as { type?: string; secret_token?: string; data?: { id?: string } };
  const valid = !input.secret || body.secret_token === input.secret;
  return { valid, externalId: body.data?.id ?? '', type: body.type ?? 'unknown', data: body.data };
}
