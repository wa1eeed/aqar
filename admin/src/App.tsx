import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Placeholder } from './pages/Placeholder';
import { Tenants } from './pages/super/Tenants';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout title="لوحة المعلومات">
            <Dashboard />
          </Layout>
        }
      />
      <Route
        path="/properties"
        element={
          <Layout title="العقارات">
            <Placeholder name="العقارات" />
          </Layout>
        }
      />
      <Route
        path="/leads"
        element={
          <Layout title="الطلبات">
            <Placeholder name="الطلبات" />
          </Layout>
        }
      />
      <Route
        path="/bookings"
        element={
          <Layout title="الحجوزات">
            <Placeholder name="الحجوزات" />
          </Layout>
        }
      />
      <Route
        path="/settings"
        element={
          <Layout title="الإعدادات">
            <Settings />
          </Layout>
        }
      />
      <Route
        path="/super"
        element={
          <Layout title="المشتركون — لوحة السوبر-أدمن">
            <Tenants />
          </Layout>
        }
      />
      <Route
        path="*"
        element={
          <Layout title="غير موجود">
            <Placeholder name="الصفحة غير موجودة" />
          </Layout>
        }
      />
    </Routes>
  );
}
