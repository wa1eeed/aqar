import { useSyncExternalStore } from 'react';

export type Scope = 'staff' | 'platform';

export interface AuthUser {
  sub: string;
  typ: string;
  role?: string;
  perms?: string[];
  name?: string;
  email?: string;
  mustSetup2fa?: boolean;
}

interface State {
  token: string | null;
  scope: Scope | null;
  user: AuthUser | null;
}

let state: State = {
  token: localStorage.getItem('mz_admin_token'),
  scope: (localStorage.getItem('mz_admin_scope') as Scope | null) ?? null,
  user: null,
};

const listeners = new Set<() => void>();
function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

export function getAuth(): State {
  return state;
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAuth(): State {
  return useSyncExternalStore(subscribe, getAuth);
}

export function setToken(token: string | null, scope: Scope | null): void {
  state.token = token;
  state.scope = scope;
  if (token && scope) {
    localStorage.setItem('mz_admin_token', token);
    localStorage.setItem('mz_admin_scope', scope);
  } else {
    localStorage.removeItem('mz_admin_token');
    localStorage.removeItem('mz_admin_scope');
    state.user = null;
  }
  emit();
}

export function setUser(user: AuthUser | null): void {
  state.user = user;
  emit();
}

export function hasPerm(perm: string): boolean {
  return !!state.user?.perms?.includes(perm);
}
