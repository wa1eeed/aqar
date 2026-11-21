import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const officeNav = [
  { to: '/', label: 'لوحة المعلومات', end: true },
  { to: '/properties', label: 'العقارات' },
  { to: '/leads', label: 'الطلبات' },
  { to: '/bookings', label: 'الحجوزات' },
  { to: '/settings', label: 'الإعدادات' },
];

const platformNav = [{ to: '/super', label: 'المشتركون' }];

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> منزلة
        </div>

        <div className="nav-section">لوحة المكتب</div>
        {officeNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {n.label}
          </NavLink>
        ))}

        <div className="nav-section">المنصّة (سوبر-أدمن)</div>
        {platformNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {n.label}
          </NavLink>
        ))}
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="title">{title}</div>
          <span className="chip">المشترك: demo</span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
