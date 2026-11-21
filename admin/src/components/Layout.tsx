import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, setToken } from '../lib/auth';
import { auth } from '../lib/api';

const officeNav = [
  { to: '/', label: 'لوحة المعلومات', end: true },
  { to: '/properties', label: 'العقارات' },
  { to: '/leads', label: 'الطلبات' },
  { to: '/bookings', label: 'الحجوزات' },
  { to: '/settings', label: 'الإعدادات' },
];
const platformNav = [{ to: '/super', label: 'المشتركون', end: false }];

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  const { user, scope } = useAuth();
  const nav = scope === 'platform' ? platformNav : officeNav;

  async function logout() {
    try {
      await auth.logout();
    } catch {
      /* ignore */
    }
    setToken(null, null);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> منزلة
        </div>
        <div className="nav-section">{scope === 'platform' ? 'المنصّة' : 'لوحة المكتب'}</div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            {n.label}
          </NavLink>
        ))}
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="title">{title}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="chip">{user?.name ?? user?.email ?? '—'}</span>
            <button className="btn ghost sm" onClick={logout}>
              خروج
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
