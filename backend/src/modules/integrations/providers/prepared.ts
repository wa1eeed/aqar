import { z } from 'zod';
import type { Category, ProviderDefinition, UiHint } from '../types';
import { PREPARED_MESSAGE } from '../types';
import { ident, optionalUrl, secret } from './common';

/**
 * "Prepared" providers (docs/05 §3): schemas, admin screen and webhook route exist; the HTTP calls are
 * written when the company receives the provider's partner documentation and credentials. Until then
 * testConnection reports it and the capability stays hidden.
 */
function prepared(
  key: string,
  category: Category,
  nameAr: string,
  descriptionAr: string,
  config: z.ZodRawShape,
  secrets: z.ZodRawShape,
  uiHints: Record<string, UiHint>,
  extra: { webhookPath?: string; supportsSandbox?: boolean } = {},
): ProviderDefinition {
  return {
    key,
    category,
    nameAr,
    descriptionAr,
    configSchema: z.object(config).strict(),
    secretsSchema: z.object(secrets).partial().strict(),
    uiHints,
    supportsSandbox: extra.supportsSandbox ?? true,
    prepared: true,
    ...(extra.webhookPath ? { webhookPath: extra.webhookPath } : {}),
    async testConnection() {
      return { ok: false, messageAr: PREPARED_MESSAGE };
    },
  };
}

const base = { labelAr: 'عنوان الخدمة (Base URL)', type: 'url' as const };

export const PREPARED_PROVIDERS: ProviderDefinition[] = [
  prepared(
    'payments.rize',
    'payments',
    'رايز Rize',
    'تقسيط الإيجار الشهري',
    { baseUrl: optionalUrl, partnerId: ident() },
    { apiKey: secret(), webhookSecret: secret() },
    {
      baseUrl: base,
      partnerId: { labelAr: 'Partner ID' },
      apiKey: { labelAr: 'API Key' },
      webhookSecret: { labelAr: 'Webhook Secret' },
    },
    { webhookPath: '/api/v1/webhooks/rize' },
  ),
  prepared(
    'gov.rega',
    'government',
    'الهيئة العامة للعقار',
    'التحقق من تراخيص الإعلانات',
    { baseUrl: optionalUrl, clientId: ident(), environment: z.enum(['sandbox', 'production']).default('sandbox') },
    { clientSecret: secret(), certificate: z.string().max(10_000) },
    {
      baseUrl: base,
      clientId: { labelAr: 'Client ID' },
      environment: { labelAr: 'بيئة الهيئة', type: 'select', optionsAr: { sandbox: 'تجريبي', production: 'إنتاج' } },
      clientSecret: { labelAr: 'Client Secret' },
      certificate: { labelAr: 'الشهادة (PEM)', type: 'textarea' },
    },
    { webhookPath: '/api/v1/webhooks/gov.rega' },
  ),
  prepared(
    'gov.ejar',
    'government',
    'منصة إيجار',
    'توثيق عقود الإيجار',
    { baseUrl: optionalUrl, brokerageMembershipNo: ident(), clientId: ident() },
    { clientSecret: secret() },
    {
      baseUrl: base,
      brokerageMembershipNo: { labelAr: 'رقم عضوية الوساطة' },
      clientId: { labelAr: 'Client ID' },
      clientSecret: { labelAr: 'Client Secret' },
    },
    { webhookPath: '/api/v1/webhooks/gov.ejar' },
  ),
  prepared(
    'identity.nafath',
    'identity',
    'النفاذ الوطني',
    'التحقق من هوية العميل',
    { baseUrl: optionalUrl, appId: ident(), serviceType: ident() },
    { apiKey: secret() },
    {
      baseUrl: base,
      appId: { labelAr: 'App ID' },
      serviceType: { labelAr: 'نوع الخدمة' },
      apiKey: { labelAr: 'API Key' },
    },
    { webhookPath: '/api/v1/webhooks/identity.nafath' },
  ),
  prepared(
    'gov.nafith',
    'government',
    'نافذ',
    'السندات لأمر للمزادات',
    { baseUrl: optionalUrl, entityId: ident() },
    { apiKey: secret() },
    { baseUrl: base, entityId: { labelAr: 'رقم الجهة' }, apiKey: { labelAr: 'API Key' } },
    { webhookPath: '/api/v1/webhooks/gov.nafith' },
  ),
  ...(['unifonic', 'taqnyat', 'msegat'] as const).map((name) =>
    prepared(
      `sms.${name}`,
      'sms',
      { unifonic: 'Unifonic', taqnyat: 'Taqnyat', msegat: 'Msegat' }[name],
      'رمز الدخول والتنبيهات بالجوال',
      { senderName: ident(11) },
      name === 'unifonic' ? { appSid: secret() } : { apiKey: secret() },
      { senderName: { labelAr: 'اسم المرسل' }, appSid: { labelAr: 'App SID' }, apiKey: { labelAr: 'API Key' } },
      { supportsSandbox: false },
    ),
  ),
];
