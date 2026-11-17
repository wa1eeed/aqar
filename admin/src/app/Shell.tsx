import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { GROUP_LABELS, visibleNav } from './nav';
import { useSession } from './session';

export function Shell() {
  const { me, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Feature flags come from settings.features (Phase 2+); auctions stay hidden until then.
  const items = visibleNav(me?.permissions ?? [], { auctions: false });

  let lastGroup: string | null = null;
  return (
    <div className="adm-shell">
      <aside className={`adm-side${open ? ' is-open' : ''}`} aria-label="القائمة الرئيسية">
        <div className="logo-wrap" style={{ padding: '4px 8px 16px' }}>
          <Logo />
        </div>
        <nav className="adm-nav">
          {items.map((n) => {
            const sep =
              n.group !== lastGroup && GROUP_LABELS[n.group] ? (
                <div className="sep">{GROUP_LABELS[n.group]}</div>
              ) : null;
            lastGroup = n.group;
            return (
              <div key={n.to} style={{ display: 'contents' }}>
                {sep}
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => (isActive ? 'is-active' : '')}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={n.icon} />
                  {n.label}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="me">
          <span className="avatar" style={{ width: 38, height: 38, fontSize: 15 }} aria-hidden="true">
            {me?.staff.name.slice(0, 1)}
          </span>
          <div>
            <b>{me?.staff.name}</b>
            <small>{me?.staff.role.nameAr}</small>
          </div>
          <button
            type="button"
            className="icon-btn me-actions"
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            onClick={() => void signOut()}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="adm-main">
        <header className="adm-top">
          <button
            type="button"
            className="icon-btn adm-menu-btn"
            aria-label="القائمة"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name="list" />
          </button>
          <div className="adm-search" role="search">
            <Icon name="search" />
            ابحث عن عقار، طلب، عميل، حجز…
            <kbd>⌘ K</kbd>
          </div>
          <span className="sp" />
          <a className="btn btn--ghost btn--sm" href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="eye" />
            عرض الموقع
          </a>
          <NavLink className="icon-btn" to="/notifications" aria-label="الإشعارات">
            <Icon name="bell" />
          </NavLink>
        </header>
        <main className="adm-body" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
