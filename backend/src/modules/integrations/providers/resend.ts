import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { email, plainText } from '../../../common/security/zod-helpers';
import type { ProviderCtx, ProviderDefinition } from '../types';
import { IntegrationError } from '../types';
import { rateLimit, secret } from './common';

const API = 'https://api.resend.com';

export const resendConfig = z
  .object({
    fromName: plainText(80).default(''),
    fromEmail: z.union([z.literal(''), email]).default(''),
    replyTo: z.union([z.literal(''), email]).default(''),
    domain: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'invalid_domain'),
      ])
      .default(''),
    rateLimitPerMin: rateLimit,
  })
  .strict();
export const resendSecrets = z.object({ apiKey: secret(), webhookSigningSecret: secret() }).partial().strict();
type Ctx = ProviderCtx<z.output<typeof resendConfig>, z.output<typeof resendSecrets>>;

export interface OutgoingMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  tags?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Display name is quoted and stripped of characters that could break the From header. */
function fromHeader(name: string, address: string): string {
  const clean = name.replace(/["\r\n<>]/g, '').trim();
  return clean ? `"${clean}" <${address}>` : address;
}

export async function resendSend(ctx: Ctx, msg: OutgoingMessage): Promise<{ id: string }> {
  const { apiKey } = ctx.secrets;
  if (!apiKey || !ctx.config.fromEmail)
    throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'resend not configured');
  const res = await ctx.http(`${API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Idempotency-Key': msg.idempotencyKey.slice(0, 256) },
    json: {
      from: fromHeader(ctx.config.fromName, ctx.config.fromEmail),
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(ctx.config.replyTo ? { reply_to: ctx.config.replyTo } : {}),
      ...(msg.headers ? { headers: msg.headers } : {}),
      ...(msg.tags ? { tags: Object.entries(msg.tags).map(([name, value]) => ({ name, value })) } : {}),
    },
  });
  if (!res.ok) {
    throw new IntegrationError(
      'INTEGRATION_HTTP_ERROR',
      `resend ${res.status}`,
      res.status,
      res.status >= 500 || res.status === 429,
    );
  }
  const body = await res.json<{ id?: string }>();
  if (!body.id) throw new IntegrationError('INTEGRATION_BAD_RESPONSE', 'resend response without id');
  return { id: body.id };
}

/**
 * Svix signature check used by Resend webhooks: HMAC-SHA256 over `${id}.${timestamp}.${body}` with
 * the base64 secret after "whsec_"; header `svix-signature` holds space-separated "v1,<base64>".
 * Rejects timestamps older/newer than 5 minutes (replay protection).
 */
export function verifySvix(
  secretValue: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: Buffer,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secretValue.startsWith('whsec_') ? secretValue.slice(6) : secretValue, 'base64');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody.toString('utf8')}`)
    .digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const resendEmail: ProviderDefinition<typeof resendConfig, typeof resendSecrets> = {
  key: 'email.resend',
  category: 'email',
  nameAr: 'Resend',
  descriptionAr: 'إشعارات البريد للعملاء والفريق',
  docsUrl: 'https://resend.com/docs',
  configSchema: resendConfig,
  secretsSchema: resendSecrets,
  uiHints: {
    fromName: { labelAr: 'اسم المرسل', placeholder: 'منزلة العقارية' },
    fromEmail: { labelAr: 'بريد المرسل', placeholder: 'no-reply@example.sa' },
    replyTo: { labelAr: 'بريد الرد', helpAr: 'تصل إليه ردود العملاء' },
    domain: { labelAr: 'النطاق المعتمد في Resend', placeholder: 'example.sa' },
    apiKey: { labelAr: 'API Key' },
    webhookSigningSecret: { labelAr: 'Webhook Signing Secret' },
    rateLimitPerMin: { labelAr: 'الحد الأقصى للرسائل في الدقيقة', type: 'number' },
  },
  supportsSandbox: false,
  webhookPath: '/api/v1/webhooks/resend',
  rateLimitPerMin: 120,
  async testConnection(ctx) {
    if (!ctx.secrets.apiKey) return { ok: false, messageAr: 'أدخل مفتاح API' };
    const res = await ctx.http(`${API}/domains`, { headers: { Authorization: `Bearer ${ctx.secrets.apiKey}` } });
    if (res.status === 401 || res.status === 403) return { ok: false, messageAr: 'مفتاح API غير صالح' };
    if (!res.ok) return { ok: false, messageAr: `فشل الاتصال (${res.status})` };
    const body = await res.json<{ data?: Array<{ name: string; status: string }> }>();
    const domain = body.data?.find((d) => d.name === ctx.config.domain);
    if (!ctx.config.domain) return { ok: true, messageAr: 'المفتاح صالح — حدّد النطاق المعتمد' };
    if (!domain) return { ok: false, messageAr: `النطاق ${ctx.config.domain} غير مضاف في Resend` };
    if (domain.status !== 'verified')
      return {
        ok: false,
        messageAr: `النطاق ${domain.name} غير موثّق بعد (SPF/DKIM)`,
        details: { status: domain.status },
      };
    return { ok: true, messageAr: `تم الاتصال — النطاق ${domain.name} موثّق` };
  },
};
