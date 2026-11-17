import { Route, Routes } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { IntegrationDetailPage } from '../pages/IntegrationDetailPage';
import { IntegrationsPage } from '../pages/IntegrationsPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { RolesPage } from '../pages/RolesPage';
import { StaffPage } from '../pages/StaffPage';
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage } from '../pages/TokenPages';
import { NAV } from './nav';
import { RequireAuth, useSession } from './session';
import { Shell } from './Shell';

const BUILT = new Set(['/', '/staff', '/integrations']);

function Gate({ permission, children }: { permission: string | null; children: JSX.Element }) {
  const { can } = useSession();
  if (permission && !can(permission)) return <NotFoundPage />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="staff"
          element={
            <Gate permission="staff.manage">
              <StaffPage />
            </Gate>
          }
        />
        <Route
          path="staff/roles"
          element={
            <Gate permission="roles.manage">
              <RolesPage />
            </Gate>
          }
        />
        <Route
          path="integrations"
          element={
            <Gate permission="integrations.manage">
              <IntegrationsPage />
            </Gate>
          }
        />
        <Route
          path="integrations/:key"
          element={
            <Gate permission="integrations.manage">
              <IntegrationDetailPage />
            </Gate>
          }
        />
        {NAV.filter((n) => !BUILT.has(n.to)).map((n) => (
          <Route
            key={n.to}
            path={`${n.to.slice(1)}/*`}
            element={
              <Gate permission={n.permission}>
                <PlaceholderPage item={n} />
              </Gate>
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
