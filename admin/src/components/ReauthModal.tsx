import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../app/session';
import { api, ApiError, setReauthHandler, tokenStore } from '../lib/api';
import { CodeInput } from './CodeInput';
import { Modal } from './Modal';

/**
 * Global re-authentication prompt (docs/03 §1). The API client calls the handler when a request
 * answers REAUTH_REQUIRED; the original request is retried once the identity is confirmed.
 */
export function ReauthHost() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    setReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setOpen(true);
        }),
    );
    return () => setReauthHandler(null);
  }, []);

  const close = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  return open ? <ReauthModal totp={!!me?.staff.totpEnabled} onDone={close} /> : null;
}

function ReauthModal({ totp, onDone }: { totp: boolean; onDone: (ok: boolean) => void }) {
  const [mode, setMode] = useState<'password' | 'code'>(totp ? 'code' : 'password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === 'code' ? { code } : { password };
      const res = await api<{ accessToken: string }>('/auth/staff/reauth', { body });
      tokenStore.set(res.accessToken);
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحقق');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="تأكيد الهوية" onClose={() => onDone(false)}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <p className="muted">هذا إجراء حساس، أكّد هويتك للمتابعة.</p>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        {mode === 'code' ? (
          <CodeInput value={code} onChange={setCode} autoFocus />
        ) : (
          <div className="field">
            <label htmlFor="reauth-pass">كلمة المرور</label>
            <input
              id="reauth-pass"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={busy || (mode === 'code' ? code.length !== 6 : !password)}
        >
          تأكيد
        </button>
        {totp ? (
          <button
            type="button"
            className="link-btn"
            onClick={() => setMode((m) => (m === 'code' ? 'password' : 'code'))}
          >
            {mode === 'code' ? 'استخدم كلمة المرور' : 'استخدم رمز التطبيق'}
          </button>
        ) : null}
      </form>
    </Modal>
  );
}
