import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { api, ApiError, fieldMessage } from '../lib/api';
import { AuthLayout, FormError, PasswordStep } from './LoginPage';

/** Reads ?token= once and removes it from the address bar (keeps it out of history/referrers). */
function useOneTimeToken(): string {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  useEffect(() => {
    if (params.has('token')) window.history.replaceState(null, '', window.location.pathname);
  }, [params]);
  return token;
}

function Done({ title, text }: { title: string; text: string }) {
  return (
    <>
      <Logo size={44} to="/login" />
      <h1 style={{ fontSize: 28, marginTop: 20 }}>{title}</h1>
      <p className="muted">{text}</p>
      <Link className="btn btn--primary btn--block" to="/login">
        تسجيل الدخول
      </Link>
    </>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) return fieldMessage(Object.values(e.fields)[0]) ?? e.message;
  return 'حدث خطأ غير متوقع، حاول مرة أخرى';
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/staff/password/forgot', { body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {sent ? (
        <Done
          title="تحقق من بريدك"
          text="إن كان البريد مسجّلاً لدينا فستصلك رسالة برابط إعادة التعيين خلال دقائق. الرابط صالح 30 دقيقة."
        />
      ) : (
        <form onSubmit={submit} style={{ display: 'contents' }}>
          <Logo size={44} to="/login" />
          <h1 style={{ fontSize: 28, marginTop: 20 }}>نسيت كلمة المرور</h1>
          <p className="muted">أدخل بريدك وسنرسل لك رابط إعادة التعيين.</p>
          <FormError error={error} />
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              className="input"
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            إرسال الرابط
          </button>
          <Link className="link" to="/login" style={{ fontSize: 14, textAlign: 'center' }}>
            العودة لتسجيل الدخول
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}

function TokenPasswordPage({
  endpoint,
  field,
  title,
  doneTitle,
  doneText,
}: {
  endpoint: string;
  field: 'newPassword' | 'password';
  title: string;
  doneTitle: string;
  doneText: string;
}) {
  const token = useOneTimeToken();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'الرابط غير صالح، اطلب رابطاً جديداً');

  async function submit(password: string) {
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { body: { token, [field]: password } });
      setDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {done ? (
        <Done title={doneTitle} text={doneText} />
      ) : (
        <PasswordStep busy={busy || !token} error={error} title={title} onSubmit={submit} />
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  return (
    <TokenPasswordPage
      endpoint="/auth/staff/password/reset"
      field="newPassword"
      title="تعيين كلمة مرور جديدة"
      doneTitle="تم تغيير كلمة المرور"
      doneText="سُجّل خروجك من جميع الأجهزة. ادخل الآن بكلمة المرور الجديدة."
    />
  );
}

export function AcceptInvitePage() {
  return (
    <TokenPasswordPage
      endpoint="/auth/staff/invite/accept"
      field="password"
      title="أهلاً بك في الفريق — أنشئ كلمة المرور"
      doneTitle="تم إنشاء حسابك"
      doneText="يمكنك الآن تسجيل الدخول إلى لوحة التحكم."
    />
  );
}
