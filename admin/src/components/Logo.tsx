import { Link } from 'react-router-dom';

export function Logo({ size = 40, to = '/' }: { size?: number; to?: string }) {
  return (
    <Link className="logo" to={to} style={{ color: 'var(--green)' }} aria-label="منزلة — لوحة التحكم">
      <svg viewBox="0 0 40 40" style={{ width: size, height: size }} aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="currentColor" />
        <path d="M10 29V18l10-7 10 7v11" fill="none" stroke="var(--gold)" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M16 29v-6h8v6" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <span>
        <b>منزلة</b>
        <small>لوحة التحكم</small>
      </span>
    </Link>
  );
}
