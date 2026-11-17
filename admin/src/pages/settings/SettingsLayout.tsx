import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../../app/session';

/** Built settings sections (docs/07 §10), in the order of the design; more arrive with later phases. */
export const SETTINGS_TABS: Array<{ path: string; label: string; permission: string }> = [
  { path: 'booking', label: 'الحجز وطرق الدفع', permission: 'settings.booking' },
  { path: 'bank-transfer', label: 'التحويل البنكي', permission: 'settings.payments' },
  { path: 'locations', label: 'المدن والأحياء', permission: 'settings.locations' },
];

/** Page frame shared by every settings section: title, actions and the section tabs. */
export function SettingsLayout({
  subtitle,
  actions,
  children,
}: {
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { can } = useSession();
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الإعدادات</h1>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="acts">{actions}</div> : null}
      </div>
      <nav className="tabs2 panel2" aria-label="أقسام الإعدادات" style={{ marginBottom: 18 }}>
        {SETTINGS_TABS.filter((t) => can(t.permission)).map((t) => (
          <NavLink key={t.path} to={`/settings/${t.path}`} className={({ isActive }) => (isActive ? 'on' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}

/** Accessible switch styled like the prototype (`.switch`). */
export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`switch${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}
