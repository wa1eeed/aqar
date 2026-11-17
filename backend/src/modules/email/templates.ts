/**
 * Minimal Arabic RTL templates for Phase 1 (otp, staff-invite, password-reset, security-new-login).
 * The full react-email templates and admin overrides arrive with the Resend integration (docs/06 §4).
 * Every interpolated value is HTML-escaped.
 */
export type TemplateKey = 'otp' | 'staff-invite' | 'password-reset' | 'security-new-login';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(brand: string, title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#0F4C3A;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#FAF7F2;font-family:Tajawal,'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#14211C">
<div style="max-width:600px;margin:0 auto;padding:32px 24px"><h2 style="color:#0F4C3A;margin:0 0 8px">${esc(brand)}</h2>
<div style="background:#fff;border:1px solid #E4DBCC;border-radius:16px;padding:24px"><h3 style="margin-top:0">${esc(title)}</h3>${body}${button}</div>
<p style="color:#5F6B66;font-size:12px;margin-top:16px">${esc(brand)}</p></div></body></html>`;
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
