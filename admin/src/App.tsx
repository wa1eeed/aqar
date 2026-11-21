import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, setUser, setToken } from './lib/auth';
import { auth } from './lib/api';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Properties } from './pages/Properties';
import { Leads } from './pages/Leads';
import { Bookings } from './pages/Bookings';
import { Settings } from './pages/Settings';
import { Tenants } from './pages/super/Tenants';
import { Placeholder } from './pages/Placeholder';

export function App() {
  const { token, user, scope } = useAuth();

  useEffect(() => {
    if (token && !user) auth.me().then(setUser).catch(() => setToken(null, null));
  }, [token, user]);

  if (!token) return <Login />;

  if (scope === 'platform') {
    return (
      <Routes>
        <Route path="/super" element={<Layout title="المشتركون — لوحة السوبر-أدمن"><Tenants /></Layout>} />
        <Route path="*" element={<Navigate to="/super" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout title="لوحة المعلومات"><Dashboard /></Layout>} />
      <Route path="/properties" element={<Layout title="العقارات"><Properties /></Layout>} />
      <Route path="/leads" element={<Layout title="الطلبات"><Leads /></Layout>} />
      <Route path="/bookings" element={<Layout title="الحجوزات"><Bookings /></Layout>} />
      <Route path="/settings" element={<Layout title="الإعدادات"><Settings /></Layout>} />
      <Route path="*" element={<Layout title="غير موجود"><Placeholder name="الصفحة غير موجودة" /></Layout>} />
    </Routes>
  );
}
