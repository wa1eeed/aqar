import { createContext, useContext, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export interface Session {
  authenticated: boolean;
  name: string;
  roleName: string;
  permissions: string[];
  features: { auctions: boolean };
}

/**
 * Staff session. Phase 1 replaces this with `GET /api/v1/auth/me` + refresh rotation (docs/03).
 * Until then production builds have no session, so every panel route redirects to the login page;
 * development builds show the shell with a preview session (no data is loaded).
 */
const PREVIEW: Session = {
  authenticated: import.meta.env.DEV,
  name: 'معاينة',
  roleName: 'وضع التطوير',
  permissions: [
    'dashboard.view',
    'properties.view',
    'leads.view',
    'viewings.manage',
    'bookings.view',
    'payments.view',
    'customers.view',
    'reports.view',
    'seo.manage',
    'integrations.manage',
    'settings.general',
    'staff.manage',
    'audit.view',
  ],
  features: { auctions: false },
};

const SessionContext = createContext<Session>(PREVIEW);

export function SessionProvider({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={PREVIEW}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  return session.authenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
