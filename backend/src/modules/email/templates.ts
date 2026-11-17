/**
 * Minimal Arabic RTL templates for Phase 1 (otp, staff-invite, password-reset, security-new-login).
 * The full react-email templates and admin overrides arrive with the Resend integration (docs/06 §4).
 * Every interpolated value is HTML-escaped.
 */
export type TemplateKey = 'otp' | 'staff-invite' | 'password-reset' | 'security-new-login';

/** Brand context of every email (docs/06 §4): theme colour and the legal footer. */
export interface EmailContext {
  brand: string;
  primary?: string;
  footer?: string[];
  /** Non-transactional emails link to the recipient's notification preferences. */
  manageUrl?: string;
}

/** Event emails rendered from structured content (lead-new-staff, viewing-confirmed, …). */
export interface NotificationEmail {
  subject: string;
  title: string;
  intro: string;
  details?: Array<[string, string]>;
  cta?: { label: string; url: string };
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

function layout(ctx: EmailContext | string, title: string, body: string, cta?: { label: string; url: string }): string {
  const c: EmailContext = typeof ctx === 'string' ? { brand: ctx } : ctx;
  const primary = c.primary && COLOR.test(c.primary) ? c.primary : '#0F4C3A';
  const safeUrl = cta && /^https?:\/\//.test(cta.url) ? cta.url : null;
  const button =
    cta && safeUrl
      ? `<p style="margin:24px 0"><a href="${esc(safeUrl)}" style="background:${primary};color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>`
      : '';
  const footer = [c.brand, ...(c.footer ?? [])]
    .filter(Boolean)
    .map((l) => esc(l))
    .join('<br>');
  const manage =
    c.manageUrl && /^https?:\/\//.test(c.manageUrl)
      ? `<br><a href="${esc(c.manageUrl)}" style="color:#5F6B66">إدارة الإشعارات وإيقافها</a>`
      : '';
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#FAF7F2;font-family:Tajawal,'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#14211C">
<div style="max-width:600px;margin:0 auto;padding:32px 24px"><h2 style="color:${primary};margin:0 0 8px">${esc(c.brand)}</h2>
<div style="background:#fff;border:1px solid #E4DBCC;border-radius:16px;padding:24px"><h3 style="margin-top:0">${esc(title)}</h3>${body}${button}</div>
<p style="color:#5F6B66;font-size:12px;line-height:1.7;margin-top:16px">${footer}${manage}</p></div></body></html>`;
}

/** Event email: title, intro paragraph, optional key/value details and a call to action. */
export function renderNotificationEmail(n: NotificationEmail, ctx: EmailContext): RenderedEmail {
  const rows = (n.details ?? [])
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#5F6B66;width:40%">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join('');
  const body = `<p style="line-height:1.8">${esc(n.intro)}</p>${rows ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>` : ''}`;
  const text = [
    n.title,
    '',
    n.intro,
    ...(n.details ?? []).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    ...(n.cta ? ['', `${n.cta.label}: ${n.cta.url}`] : []),
    '',
    ctx.brand,
    ...(ctx.footer ?? []),
    ...(ctx.manageUrl ? [`إدارة الإشعارات: ${ctx.manageUrl}`] : []),
  ].join('\n');
  return { subject: n.subject, text, html: layout(ctx, n.title, body, n.cta) };
}

export function renderTemplate(key: TemplateKey, vars: Record<string, string>): RenderedEmail {
  const brand = vars.brand ?? 'منزلة العقارية';
  switch (key) {
    case 'otp': {
      const subject = `رمز الدخول: ${vars.code}`;
      const text = `رمز الدخول إلى ${brand} هو ${vars.code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`;
      const body = `<p>رمز الدخول الخاص بك:</p><p style="font-size:30px;letter-spacing:6px;font-weight:700;direction:ltr;text-align:center">${esc(vars.code ?? '')}</p><p>صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أحد.</p>`;
      return { subject, text, html: layout(brand, 'رمز التحقق', body) };
    }
    case 'staff-invite': {
      const subject = `دعوة للانضمام إلى فريق ${brand}`;
      const text = `مرحباً ${vars.name}،\nتمت دعوتك إلى لوحة تحكم ${brand}. أنشئ كلمة المرور من الرابط التالي (صالح 72 ساعة):\n${vars.url}`;
      const body = `<p>مرحباً ${esc(vars.name ?? '')}،</p><p>تمت دعوتك إلى لوحة تحكم ${esc(brand)}. الرابط صالح لمدة 72 ساعة.</p>`;
      return {
        subject,
        text,
        html: layout(brand, 'دعوة للانضمام إلى الفريق', body, { label: 'إنشاء كلمة المرور', url: vars.url ?? '' }),
      };
    }
    case 'password-reset': {
      const subject = 'إعادة تعيين كلمة المرور';
      const text = `طلبت إعادة تعيين كلمة المرور. الرابط صالح 30 دقيقة:\n${vars.url}\nإن لم تطلب ذلك فتجاهل هذه الرسالة.`;
      const body = `<p>طلبت إعادة تعيين كلمة المرور لحسابك. الرابط صالح لمدة 30 دقيقة.</p><p>إن لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك لم تتغير.</p>`;
      return {
        subject,
        text,
        html: layout(brand, subject, body, { label: 'تعيين كلمة مرور جديدة', url: vars.url ?? '' }),
      };
    }
    case 'security-new-login': {
      const subject = 'تسجيل دخول جديد إلى حسابك';
      const text = `تم تسجيل الدخول إلى حسابك في ${vars.time} من ${vars.device}. إن لم تكن أنت فغيّر كلمة المرور فوراً.`;
      const body = `<p>تم تسجيل الدخول إلى حسابك في ${esc(vars.time ?? '')} من ${esc(vars.device ?? '')}.</p><p>إن لم تكن أنت فغيّر كلمة المرور فوراً وتواصل مع مدير النظام.</p>`;
      return { subject, text, html: layout(brand, subject, body) };
    }
  }
}
