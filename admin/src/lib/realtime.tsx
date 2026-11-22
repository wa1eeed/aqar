import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSession } from '../app/session';
import { refreshSession, tokenStore } from './api';

type Handler = (payload: Record<string, unknown>) => void;

interface RealtimeValue {
  connected: boolean;
  /** Subscribe to a server event; returns the unsubscribe function. */
  on(event: string, fn: Handler): () => void;
}

const RealtimeContext = createContext<RealtimeValue>({ connected: false, on: () => () => undefined });

/**
 * One Socket.IO connection per tab (docs/02 §9). The server drops the socket when the access token
 * expires: we refresh the token and reconnect with backoff; handlers survive reconnects.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [connected, setConnected] = useState(false);
  const handlers = useRef(new Map<string, Set<Handler>>());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      const s = io({
        path: '/ws',
        transports: ['websocket'],
        auth: (cb) => cb({ token: tokenStore.get() ?? '' }),
        reconnection: false,
      });
      socketRef.current = s;
      s.onAny((event: string, payload: Record<string, unknown>) => {
        handlers.current.get(event)?.forEach((fn) => fn(payload ?? {}));
      });
      s.on('connect', () => {
        attempt = 0;
        setConnected(true);
      });
      s.on('auth.invalid', () => void refreshSession());
      s.on('disconnect', () => {
        setConnected(false);
        retry();
      });
      s.on('connect_error', () => {
        setConnected(false);
        retry();
      });
    };
    const retry = () => {
      if (stopped) return;
      socketRef.current?.removeAllListeners();
      socketRef.current?.close();
      clearTimeout(timer);
      const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500;
      timer = setTimeout(async () => {
        if (stopped) return;
        await refreshSession().catch(() => false);
        open();
      }, delay);
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socketRef.current?.removeAllListeners();
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [status]);

  const on = useCallback((event: string, fn: Handler) => {
    const set = handlers.current.get(event) ?? new Set<Handler>();
    set.add(fn);
    handlers.current.set(event, set);
    return () => {
      set.delete(fn);
    };
  }, []);
  const value = useMemo<RealtimeValue>(() => ({ connected, on }), [connected, on]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Runs `fn` for every `event` while mounted. */
export function useRealtimeEvent(event: string, fn: Handler): void {
  const { on } = useRealtime();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => on(event, (p) => ref.current(p)), [on, event]);
}
