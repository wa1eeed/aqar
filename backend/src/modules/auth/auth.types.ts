export type Audience = 'staff' | 'customer';

/** Authenticated subject attached to `req.user` by the AuthGuard. */
export interface AuthUser {
  typ: Audience;
  id: string;
  /** Staff role key (owner, admin, agent, custom_…); null for customers. */
  role: string | null;
  perms: string[];
  /** Row-level scope for staff ('own' = agent rules of docs/03 §3). */
  scope: 'all' | 'own';
  /** Unix seconds of the last password/TOTP verification (re-auth window, docs/03 §1). */
  authTime: number;
  /** Refresh-token family of this session. */
  sid: string;
}

export const ACCESS_TTL_SEC = 15 * 60;
export const STAFF_REFRESH_TTL_SEC = 14 * 24 * 3600;
export const CUSTOMER_REFRESH_TTL_SEC = 30 * 24 * 3600;
export const REAUTH_WINDOW_SEC = 10 * 60;
