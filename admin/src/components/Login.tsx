import { useState, type FormEvent } from 'react';
import { auth } from '../lib/api';
import { setToken, setUser, type Scope } from '../lib/auth';

export function Login() {
  const [scope, setScope] = useState<Scope>('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(accessToken: string) {
    setToken(accessToken, scope);
    try {
      setUser(await auth.me());
    } catch {
      /* يبقى الرمز */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = challenge
        ? scope === 'staff'
          ? await auth.staff2fa(challenge, code)
          : await auth.platform2fa(challenge, code)
        : scope === 'staff'
          ? await auth.staffLogin(email, password)
          : await auth.platformLogin(email, password);
      if ('twoFactorRequired' in r) setChallenge(r.challengeId);
      else await finish(r.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ color: 'var(--ink)', justifyContent: 'center' }}>
          <span className="dot" /> منزلة
        </div>
        <div className="login-tabs">
          <button type="button" className={scope === 'staff' ? 'on' : ''} onClick={() => { setScope('staff'); setChallenge(null); }}>
            لوحة المكتب
          </button>
          <button type="button" className={scope === 'platform' ? 'on' : ''} onClick={() => { setScope('platform'); setChallenge(null); }}>
            المنصّة (سوبر-أدمن)
          </button>
        </div>

        {!challenge ? (
          <>
            <label>البريد الإلكتروني
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </label>
            <label>كلمة المرور
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </label>
          </>
        ) : (
          <label>رمز التحقّق (2FA)
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </label>
        )}

        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? '…' : challenge ? 'تحقّق' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  );
}
