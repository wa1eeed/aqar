import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { CodeInput } from '../components/CodeInput';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { api, ApiError, fieldMessage } from '../lib/api';
import type { LoginResponse, LoginStep } from '../lib/types';

/** Two-column auth layout from design/screenshots/a-login.png. */
export function AuthLayout({ children, art = 'default' }: { children: ReactNode; art?: 'default' | 'security' }) {
  return (
    <div className="login-wrap">
      <div className="login-form">
        <div className="box">{children}</div>
      </div>
      <div className="login-art">
        {art === 'security' ? (
          <h2 style={{ fontSize: 44, lineHeight: 1.3 }}>
            حماية إضافية
            <br />
            <span style={{ color: 'var(--gold)' }}>لحسابات المدراء والمالية</span>
          </h2>
        ) : (
          <>
            <div>
              <span className="eyebrow" style={{ color: 'var(--gold)' }}>
                منصة عقار أونلاين
              </span>
              <h2 style={{ fontSize: 44, marginTop: 16, lineHeight: 1.3 }}>
                كل عقاراتك وطلباتك
                <br />
                وعملاؤك في مكان واحد
              </h2>
            </div>
            <img
              src="/assets/img/photos/villa-modern.jpg"
              alt=""
              style={{ borderRadius: 24, height: 340, objectFit: 'cover', width: '100%', opacity: 0.9 }}
            />
            <p style={{ opacity: 0.7, fontSize: 13 }}>اتصال مشفّر · مصادقة ثنائية للمدراء</p>
          </>
        )}
      </div>
    </div>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null;
}

/** Only same-app relative paths are allowed as ?next= (no open redirect). */
function safeNext(next: string | null): string {
  return next && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) ? next : '/';
}

type Stage =
  | { kind: 'credentials' }
  | { kind: LoginStep; challengeId: string }
  | { kind: 'recovery_codes'; codes: string[]; accessToken: string };

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [stage, setStage] = useState<Stage>({ kind: 'credentials' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === 'authenticated' && stage.kind !== 'recovery_codes') return <Navigate to={next} replace />;

  async function finish(res: LoginResponse, recoveryCodes?: string[]) {
    if ('accessToken' in res) {
      if (recoveryCodes?.length) {
        setStage({ kind: 'recovery_codes', codes: recoveryCodes, accessToken: res.accessToken });
        return;
      }
      await session.signIn(res.accessToken);
      navigate(next, { replace: true });
      return;
    }
    setStage({ kind: res.next, challengeId: res.challengeId });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'CHALLENGE_EXPIRED' || e.code === 'TOO_MANY_ATTEMPTS') setStage({ kind: 'credentials' });
        setError(fieldMessage(Object.values(e.fields)[0]) ?? e.message);
      } else setError('حدث خطأ غير متوقع، حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout art={stage.kind === 'credentials' ? 'default' : 'security'}>
      {stage.kind === 'credentials' && (
        <CredentialsStep
          busy={busy}
          error={error}
          onSubmit={(email, password) =>
            run(async () => finish(await api<LoginResponse>('/auth/staff/login', { body: { email, password } })))
          }
        />
      )}
      {stage.kind === 'totp' && (
        <TotpStep
          busy={busy}
          error={error}
          onSubmit={(code) =>
            run(async () =>
              finish(await api<LoginResponse>('/auth/staff/2fa', { body: { challengeId: stage.challengeId, code } })),
            )
          }
        />
      )}
      {stage.kind === 'password_change' && (
        <PasswordStep
          busy={busy}
          error={error}
          title="اختر كلمة مرور جديدة"
          hint="هذا أول دخول لك، لذلك يلزم تعيين كلمة مرور خاصة بك."
          onSubmit={(newPassword) =>
            run(async () =>
              finish(
                await api<LoginResponse>('/auth/staff/password/initial', {
                  body: { challengeId: stage.challengeId, newPassword },
                }),
              ),
            )
          }
        />
      )}
      {stage.kind === 'totp_setup' && (
        <TotpSetupStep
          challengeId={stage.challengeId}
          busy={busy}
          error={error}
          setError={setError}
          onConfirm={(code) =>
            run(async () => {
              const res = await api<LoginResponse & { recoveryCodes: string[] }>('/auth/staff/2fa/enable', {
                body: { challengeId: stage.challengeId, code },
              });
              await finish(res, res.recoveryCodes);
            })
          }
        />
      )}
      {stage.kind === 'recovery_codes' && (
        <RecoveryCodes
          codes={stage.codes}
          onDone={() =>
            run(async () => {
              await session.signIn(stage.accessToken);
              navigate(next, { replace: true });
            })
          }
        />
      )}
    </AuthLayout>
  );
}

function CredentialsStep({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (e: string, p: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(email, password);
      }}
      style={{ display: 'contents' }}
    >
      <Logo size={44} to="/login" />
      <h1 style={{ fontSize: 30, marginTop: 20 }}>تسجيل الدخول</h1>
      <p className="muted">ادخل ببيانات حسابك في فريق العمل.</p>
      <FormError error={error} />
      <div className="field">
        <label htmlFor="email">البريد الإلكتروني</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="username"
          dir="ltr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Link className="link" style={{ fontSize: 14 }} to="/forgot-password">
          نسيت كلمة المرور؟
        </Link>
      </div>
      <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
        {busy ? 'جارٍ التحقق…' : 'دخول'}
      </button>
    </form>
  );
}

function TotpStep({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  return (
    <form
      className="login-step"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
    >
      <span className="badge-ic">
        <Icon name="shield" />
      </span>
      <h1 style={{ fontSize: 28 }}>التحقق بخطوتين</h1>
      <p className="muted">
        {recovery ? 'أدخل أحد رموز الاسترداد التي حفظتها.' : 'أدخل الرمز من تطبيق المصادقة على جوالك.'}
      </p>
      <FormError error={error} />
      {recovery ? (
        <input
          className="input"
          dir="ltr"
          autoComplete="off"
          placeholder="xxxx-xxxx"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
      ) : (
        <CodeInput value={code} onChange={setCode} autoFocus />
      )}
      <button className="btn btn--primary btn--block" type="submit" disabled={busy || (!recovery && code.length !== 6)}>
        تحقق ودخول
      </button>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          setRecovery((r) => !r);
          setCode('');
        }}
      >
        {recovery ? 'استخدم رمز التطبيق' : 'استخدم رمز استرداد بدلاً من ذلك'}
      </button>
    </form>
  );
}

export function PasswordStep({
  busy,
  error,
  title,
  hint,
  submitLabel = 'حفظ كلمة المرور',
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  title: string;
  hint?: string;
  submitLabel?: string;
  onSubmit: (password: string) => void;
}) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const mismatch = p2.length > 0 && p1 !== p2;
  return (
    <form
      style={{ display: 'contents' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch) onSubmit(p1);
      }}
    >
      <Logo size={44} to="/login" />
      <h1 style={{ fontSize: 28, marginTop: 20 }}>{title}</h1>
      {hint ? <p className="muted">{hint}</p> : null}
      <FormError error={error} />
      <div className="field">
        <label htmlFor="np1">كلمة المرور الجديدة</label>
        <input
          id="np1"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={p1}
          onChange={(e) => setP1(e.target.value)}
        />
        <span className="hint">12 حرفاً على الأقل، ولا تتضمن اسم بريدك.</span>
      </div>
      <div className="field">
        <label htmlFor="np2">تأكيد كلمة المرور</label>
        <input
          id="np2"
          className="input"
          type="password"
          autoComplete="new-password"
          required
          value={p2}
          onChange={(e) => setP2(e.target.value)}
          aria-invalid={mismatch}
        />
        {mismatch ? <span className="field-error">كلمتا المرور غير متطابقتين</span> : null}
      </div>
      <button className="btn btn--primary btn--block" type="submit" disabled={busy || mismatch || p1.length < 12}>
        {submitLabel}
      </button>
    </form>
  );
}

function TotpSetupStep({
  challengeId,
  busy,
  error,
  setError,
  onConfirm,
}: {
  challengeId: string;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onConfirm: (code: string) => void;
}) {
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      setSetup(await api<{ qrDataUrl: string; secret: string }>('/auth/staff/2fa/setup', { body: { challengeId } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر بدء الإعداد');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-step">
      <span className="badge-ic">
        <Icon name="shield" />
      </span>
      <h1 style={{ fontSize: 28 }}>تفعيل التحقق بخطوتين</h1>
      <p className="muted">
        إلزامي لحسابات المالك والمدراء والمالية. استخدم تطبيق مصادقة مثل Google Authenticator أو Microsoft
        Authenticator.
      </p>
      <FormError error={error} />
      {!setup ? (
        <button className="btn btn--primary btn--block" type="button" onClick={start} disabled={loading}>
          {loading ? 'جارٍ التحضير…' : 'ابدأ الإعداد'}
        </button>
      ) : (
        <form
          className="login-step"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(code);
          }}
        >
          <div className="qr">
            <img src={setup.qrDataUrl} alt="رمز QR لإضافة الحساب إلى تطبيق المصادقة" />
          </div>
          <p className="hint">لا تستطيع مسح الرمز؟ أدخل هذا المفتاح يدوياً:</p>
          <div className="totp-secret">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</div>
          <p className="muted">ثم أدخل الرمز المكوّن من 6 أرقام الظاهر في التطبيق:</p>
          <CodeInput value={code} onChange={setCode} autoFocus />
          <button className="btn btn--primary btn--block" type="submit" disabled={busy || code.length !== 6}>
            تفعيل ومتابعة
          </button>
        </form>
      )}
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');
  return (
    <div className="login-step">
      <span className="badge-ic">
        <Icon name="key" />
      </span>
      <h1 style={{ fontSize: 26 }}>احفظ رموز الاسترداد</h1>
      <p className="muted">كل رمز يُستخدم مرة واحدة إذا فقدت جوالك. لن تظهر هذه الرموز مرة أخرى.</p>
      <div className="recovery">
        {codes.map((c) => (
          <code key={c}>{c}</code>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard?.writeText(text)}>
          <Icon name="copy" />
          نسخ
        </button>
        <a
          className="btn btn--ghost btn--sm"
          download="nx-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
        >
          <Icon name="doc" />
          تنزيل
        </a>
      </div>
      <label className="check" style={{ justifyContent: 'center' }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        حفظت الرموز في مكان آمن
      </label>
      <button className="btn btn--primary btn--block" type="button" disabled={!saved} onClick={onDone}>
        متابعة إلى لوحة التحكم
      </button>
    </div>
  );
}
