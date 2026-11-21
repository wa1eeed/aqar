import { z } from 'zod';
import { AWAITING_PARTNER, type ProviderDefinition } from '../provider-definition.js';

// مزوّدون "مُهيّأون": المخطّطات والشاشة والـ webhook موجودة؛ الاستدعاءات تُنفَّذ عند توفّر بيانات الربط.

const google = (z.object({ serverKey: z.string().min(1), browserKey: z.string().optional() }));

export const googleMapsProvider: ProviderDefinition = {
  key: 'maps.google',
  category: 'maps',
  scope: 'tenant',
  nameAr: 'خرائط Google',
  descriptionAr: 'بلاطات وخرائط Google (يتطلّب مفتاحاً).',
  configSchema: z.object({ mapId: z.string().optional(), language: z.string().default('ar'), region: z.string().default('SA') }),
  secretsSchema: google,
  uiHints: {
    mapId: { labelAr: 'معرّف الخريطة', type: 'text' },
    language: { labelAr: 'اللغة', type: 'text' },
    region: { labelAr: 'المنطقة', type: 'text' },
    serverKey: { labelAr: 'مفتاح الخادم', type: 'password' },
    browserKey: { labelAr: 'مفتاح المتصفّح (مقيّد بالنطاق)', type: 'password' },
  },
  supportsSandbox: false,
  testConnection: (ctx) =>
    Promise.resolve(
      (ctx.secrets as { serverKey?: string }).serverKey
        ? { ok: true, messageAr: 'المفتاح مُدخَل' }
        : { ok: false, messageAr: 'أدخل مفتاح الخادم' },
    ),
};

export const googlePlacesProvider: ProviderDefinition = {
  key: 'places.google',
  category: 'places',
  scope: 'tenant',
  nameAr: 'أماكن Google',
  descriptionAr: 'بحث الأماكن القريبة عبر Google Places (يتطلّب مفتاحاً).',
  configSchema: z.object({}),
  secretsSchema: z.object({ serverKey: z.string().min(1) }),
  uiHints: { serverKey: { labelAr: 'مفتاح الخادم', type: 'password' } },
  supportsSandbox: false,
  testConnection: (ctx) =>
    Promise.resolve(
      (ctx.secrets as { serverKey?: string }).serverKey
        ? { ok: true, messageAr: 'المفتاح مُدخَل' }
        : { ok: false, messageAr: 'أدخل مفتاح الخادم' },
    ),
};

function preparedProvider(def: Omit<ProviderDefinition, 'prepared' | 'testConnection'>): ProviderDefinition {
  return { ...def, prepared: true, testConnection: () => Promise.resolve(AWAITING_PARTNER) };
}

export const PREPARED_PROVIDERS: ProviderDefinition[] = [
  preparedProvider({
    key: 'payments.moyasar',
    category: 'payments',
    scope: 'tenant',
    nameAr: 'مدفوعات Moyasar',
    descriptionAr: 'الدفع الإلكتروني (بطاقة/Apple Pay/STC Pay).',
    configSchema: z.object({
      mode: z.enum(['invoice', 'embedded_form']).default('invoice'),
      sources: z.array(z.enum(['creditcard', 'applepay', 'stcpay'])).default(['creditcard']),
      callbackBaseUrl: z.string().url().optional(),
    }),
    secretsSchema: z.object({ secretKey: z.string(), publishableKey: z.string(), webhookSecret: z.string().optional() }),
    uiHints: {
      mode: { labelAr: 'النمط', type: 'select', options: [{ value: 'invoice', labelAr: 'فاتورة' }, { value: 'embedded_form', labelAr: 'نموذج مضمّن' }] },
      secretKey: { labelAr: 'المفتاح السرّي', type: 'password' },
      publishableKey: { labelAr: 'المفتاح العام', type: 'password' },
      webhookSecret: { labelAr: 'سرّ Webhook', type: 'password' },
    },
    supportsSandbox: true,
    webhookPath: '/api/v1/webhooks/moyasar',
  }),
  preparedProvider({
    key: 'payments.rize',
    category: 'payments',
    scope: 'tenant',
    nameAr: 'تقسيط Rize',
    descriptionAr: 'تقسيط الإيجار (مُهيّأ).',
    configSchema: z.object({ baseUrl: z.string().url().optional(), partnerId: z.string().optional() }),
    secretsSchema: z.object({ apiKey: z.string(), webhookSecret: z.string().optional() }),
    uiHints: { apiKey: { labelAr: 'مفتاح API', type: 'password' } },
    supportsSandbox: true,
    webhookPath: '/api/v1/webhooks/rize',
  }),
  preparedProvider({
    key: 'gov.rega',
    category: 'government',
    scope: 'tenant',
    nameAr: 'الهيئة العامة للعقار (ريجا)',
    descriptionAr: 'التحقّق من ترخيص الإعلان (مُهيّأ).',
    configSchema: z.object({ baseUrl: z.string().url().optional(), clientId: z.string().optional(), environment: z.string().optional() }),
    secretsSchema: z.object({ clientSecret: z.string(), certificate: z.string().optional() }),
    uiHints: { clientSecret: { labelAr: 'العميل السرّي', type: 'password' }, certificate: { labelAr: 'الشهادة (PEM)', type: 'textarea' } },
    supportsSandbox: true,
  }),
  preparedProvider({
    key: 'gov.ejar',
    category: 'government',
    scope: 'tenant',
    nameAr: 'منصّة إيجار',
    descriptionAr: 'صياغة العقود (مُهيّأ).',
    configSchema: z.object({ baseUrl: z.string().url().optional(), brokerageMembershipNo: z.string().optional(), clientId: z.string().optional() }),
    secretsSchema: z.object({ clientSecret: z.string() }),
    uiHints: { clientSecret: { labelAr: 'العميل السرّي', type: 'password' } },
    supportsSandbox: true,
  }),
  preparedProvider({
    key: 'identity.nafath',
    category: 'identity',
    scope: 'tenant',
    nameAr: 'نفاذ',
    descriptionAr: 'التحقّق من الهوية (مُهيّأ).',
    configSchema: z.object({ baseUrl: z.string().url().optional(), appId: z.string().optional(), serviceType: z.string().optional() }),
    secretsSchema: z.object({ apiKey: z.string() }),
    uiHints: { apiKey: { labelAr: 'مفتاح API', type: 'password' } },
    supportsSandbox: true,
  }),
  preparedProvider({
    key: 'gov.nafith',
    category: 'government',
    scope: 'tenant',
    nameAr: 'نافذ',
    descriptionAr: 'سندات لأمر للمزادات (مُهيّأ).',
    configSchema: z.object({ baseUrl: z.string().url().optional(), entityId: z.string().optional() }),
    secretsSchema: z.object({ apiKey: z.string() }),
    uiHints: { apiKey: { labelAr: 'مفتاح API', type: 'password' } },
    supportsSandbox: true,
  }),
  preparedProvider({
    key: 'sms.unifonic',
    category: 'sms',
    scope: 'tenant',
    nameAr: 'رسائل Unifonic',
    descriptionAr: 'رسائل SMS لرموز الدخول والإشعارات (مُهيّأ).',
    configSchema: z.object({ senderName: z.string().optional() }),
    secretsSchema: z.object({ appSid: z.string() }),
    uiHints: { appSid: { labelAr: 'App SID', type: 'password' } },
    supportsSandbox: false,
  }),
];
