import { Navigate, Route, Routes } from 'react-router-dom';
import { BookingDetailPage } from '../pages/BookingDetailPage';
import { BookingsPage } from '../pages/BookingsPage';
import { PaymentsPage } from '../pages/PaymentsPage';
import { TransfersPage } from '../pages/TransfersPage';
import { BankTransferSettingsPage } from '../pages/settings/BankTransferSettingsPage';
import { BookingSettingsPage } from '../pages/settings/BookingSettingsPage';
import { BrandingSettingsPage } from '../pages/settings/BrandingSettingsPage';
import { SeoSettingsPage } from '../pages/settings/SeoSettingsPage';
import { SETTINGS_TABS } from '../pages/settings/SettingsLayout';
import { CustomersPage } from '../pages/CustomersPage';
import { DashboardPage } from '../pages/DashboardPage';
import { IntegrationDetailPage } from '../pages/IntegrationDetailPage';
import { IntegrationsPage } from '../pages/IntegrationsPage';
import { LeadsPage } from '../pages/LeadsPage';
import { LocationsPage } from '../pages/LocationsPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { PropertiesPage } from '../pages/PropertiesPage';
import { PropertyEditorPage } from '../pages/PropertyEditorPage';
import { RolesPage } from '../pages/RolesPage';
import { StaffPage } from '../pages/StaffPage';
import { ViewingsPage } from '../pages/ViewingsPage';
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage } from '../pages/TokenPages';
import { NAV } from './nav';
import { RequireAuth, useSession } from './session';
import { Shell } from './Shell';

const BUILT = new Set([
  '/',
  '/staff',
  '/integrations',
  '/properties',
  '/leads',
  '/viewings',
  '/customers',
  '/notifications',
  '/bookings',
  '/payments',
  '/settings',
]);

/** `/settings` opens the first section the user may edit. */
function SettingsIndex() {
  const { can } = useSession();
  const first = SETTINGS_TABS.find((t) => can(t.permission));
  return first ? <Navigate to={`/settings/${first.path}`} replace /> : <NotFoundPage />;
}

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
        <Route
          path="properties"
          element={
            <Gate permission="properties.view">
              <PropertiesPage />
            </Gate>
          }
        />
        <Route
          path="properties/new"
          element={
            <Gate permission="properties.create">
              <PropertyEditorPage />
            </Gate>
          }
        />
        <Route
          path="properties/:id"
          element={
            <Gate permission="properties.view">
              <PropertyEditorPage />
            </Gate>
          }
        />
        <Route
          path="leads"
          element={
            <Gate permission="leads.view">
              <LeadsPage />
            </Gate>
          }
        />
        <Route
          path="viewings"
          element={
            <Gate permission="viewings.manage">
              <ViewingsPage />
            </Gate>
          }
        />
        <Route
          path="customers"
          element={
            <Gate permission="customers.view">
              <CustomersPage />
            </Gate>
          }
        />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="bookings"
          element={
            <Gate permission="bookings.view">
              <BookingsPage />
            </Gate>
          }
        />
        <Route
          path="bookings/:id"
          element={
            <Gate permission="bookings.view">
              <BookingDetailPage />
            </Gate>
          }
        />
        <Route
          path="payments"
          element={
            <Gate permission="payments.view">
              <PaymentsPage />
            </Gate>
          }
        />
        <Route
          path="payments/transfers"
          element={
            <Gate permission="payments.review">
              <TransfersPage />
            </Gate>
          }
        />
        <Route
          path="settings/booking"
          element={
            <Gate permission="settings.booking">
              <BookingSettingsPage />
            </Gate>
          }
        />
        <Route
          path="settings/bank-transfer"
          element={
            <Gate permission="settings.payments">
              <BankTransferSettingsPage />
            </Gate>
          }
        />
        <Route
          path="settings/branding"
          element={
            <Gate permission="settings.branding">
              <BrandingSettingsPage />
            </Gate>
          }
        />
        <Route
          path="settings/seo"
          element={
            <Gate permission="seo.manage">
              <SeoSettingsPage />
            </Gate>
          }
        />
        <Route path="settings" element={<SettingsIndex />} />
        <Route
          path="settings/locations"
          element={
            <Gate permission="settings.locations">
              <LocationsPage />
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
