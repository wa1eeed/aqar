import { z } from 'zod';
import { plainText } from '../../../common/security/zod-helpers';
import type { ProviderDefinition } from '../types';
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
