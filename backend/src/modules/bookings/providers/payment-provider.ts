export interface CheckoutParams {
  paymentId: string;
  bookingNumber: string;
  amount: bigint;
  descriptionAr: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface CheckoutResult {
  providerId?: string;
  url?: string;
  formConfig?: Record<string, unknown>;
}

export interface FetchResult {
  status: 'paid' | 'failed' | 'pending' | 'refunded';
  amount: bigint;
  currency: string;
  providerPaymentId?: string;
  raw: unknown;
}

export interface WebhookInput {
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
  secret?: string;
}

export interface WebhookResult {
  valid: boolean;
  externalId: string;
  type: string;
  data: unknown;
}

// عقد مزوّد الدفع (docs/04 §5). التفاصيل داخل المحوّل فقط.
export interface PaymentProvider {
  createCheckout(p: CheckoutParams): Promise<CheckoutResult>;
  fetchPayment(providerId: string): Promise<FetchResult>;
  refund(providerPaymentId: string, amount: bigint): Promise<{ status: string; raw: unknown }>;
  verifyWebhook(input: WebhookInput): WebhookResult;
}
