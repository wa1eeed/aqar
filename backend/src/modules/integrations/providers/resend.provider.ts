import { z } from 'zod';
import type { EmailMessage } from '../capabilities.js';
import type { ProviderCtx, ProviderDefinition } from '../provider-definition.js';

const configSchema = z.object({
  fromName: z.string().default('عقار أونلاين'),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional(),
  domain: z.string().optional(),
});
type Config = z.infer<typeof configSchema>;

const secretsSchema = z.object({
  apiKey: z.string().min(1),
  webhookSigningSecret: z.string().optional(),
});
type Secrets = z.infer<typeof secretsSchema>;

const API = 'https://api.resend.com';

export const resendProvider: ProviderDefinition<Config, Secrets> = {
  key: 'email.resend',
  category: 'email',
  scope: 'platform',
  nameAr: 'البريد عبر Resend',
  descriptionAr: 'إرسال رسائل البريد (OTP، الدعوات، الإشعارات).',
  docsUrl: 'https://resend.com/docs',
  configSchema,
  secretsSchema,
  uiHints: {
    fromName: { labelAr: 'اسم المُرسِل', type: 'text' },
    fromEmail: { labelAr: 'بريد المُرسِل', type: 'text', placeholder: 'no-reply@example.com' },
    replyTo: { labelAr: 'بريد الردّ', type: 'text' },
    domain: { labelAr: 'النطاق', type: 'text' },
    apiKey: { labelAr: 'مفتاح API', type: 'password' },
    webhookSigningSecret: { labelAr: 'سرّ توقيع Webhook', type: 'password' },
  },
  supportsSandbox: false,
  webhookPath: '/api/v1/webhooks/resend',
  async testConnection(ctx) {
    try {
      const res = await fetch(`${API}/domains`, {
        headers: { Authorization: `Bearer ${ctx.secrets.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      return res.ok
        ? { ok: true, messageAr: 'مفتاح Resend صالح' }
        : { ok: false, messageAr: `مفتاح غير صالح (HTTP ${res.status})` };
    } catch {
      return { ok: false, messageAr: 'تعذّر الاتصال بـ Resend' };
    }
  },
};

export async function sendResendEmail(
  ctx: ProviderCtx<Config, Secrets>,
  msg: EmailMessage,
): Promise<{ id: string }> {
  const res = await fetch(`${API}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.secrets.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': msg.idempotencyKey,
    },
    body: JSON.stringify({
      from: `${ctx.config.fromName} <${ctx.config.fromEmail}>`,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      reply_to: ctx.config.replyTo,
      tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend send failed: HTTP ${res.status}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export type { Config as ResendConfig, Secrets as ResendSecrets };
