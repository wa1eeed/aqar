import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, refreshSession, setSessionLostHandler, tokenStore } from '../lib/api';
import type { Me } from '../lib/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface SessionValue {
  status: Status;
  me: Me | null;
  /** Called after login finished with an access token. */
  signIn(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  can(permission: string): boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async () => {
    const data = await api<Me>('/auth/me');
    setMe(data);
    setStatus('authenticated');
  }, []);

  const reset = useCallback(() => {
    tokenStore.set(null);
    setMe(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    setSessionLostHandler(reset);
    // Restore the session from the httpOnly refresh cookie on page load.
    refreshSession()
      .then((ok) => (ok ? loadMe() : reset()))
      .catch(reset);
    return () => setSessionLostHandler(null);
  }, [loadMe, reset]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      me,
      async signIn(accessToken) {
        tokenStore.set(accessToken);
        await loadMe();
      },
      async signOut() {
        await api('/auth/logout', { method: 'POST', body: { audience: 'staff' } }).catch(() => undefined);
        reset();
      },
      reload: loadMe,
      can: (p) => {
        if (!me) return false;
        if (p.endsWith('.*')) return me.permissions.some((x) => x.startsWith(p.slice(0, -1)));
        return me.permissions.includes(p);
      },
    }),
    [status, me, loadMe, reset],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="adm-boot" role="status" aria-live="polite">
        جارٍ التحميل…
      </div>
    );
  }
  if (status === 'anonymous') {
    const next = location.pathname + location.search;
    return <Navigate to={`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  return <>{children}</>;
}
