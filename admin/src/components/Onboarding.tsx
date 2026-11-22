import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';

const KEY = 'aqaar_onboarding_dismissed';

interface Step {
  to: string;
  title: string;
  desc: string;
  perm?: string;
}

const STEPS: Step[] = [
  { to: '/settings/branding', title: 'أكمل هوية مكتبك', desc: 'الاسم، الألوان، والشعار الذي يظهر على موقعك.', perm: 'settings.branding' },
  { to: '/settings/seo', title: 'حسّن ظهورك في البحث', desc: 'الكلمات المفتاحية، الوصف، ومحركات الذكاء الاصطناعي.', perm: 'seo.manage' },
  { to: '/properties/new', title: 'أضف أول عقار', desc: 'انشر عقاراً ليظهر على موقعك مباشرة.', perm: 'properties.create' },
  { to: '/staff', title: 'ادعُ فريقك', desc: 'أضف موظفيك بأدوار وصلاحيات محدّدة.', perm: 'staff.manage' },
  { to: '/settings/booking', title: 'فعّل الحجز والمدفوعات', desc: 'اختر طرق الدفع وسياسة الحجز.', perm: 'settings.booking' },
];

const stepStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  border: '1px solid var(--line, #E4DBCC)',
  borderRadius: 12,
  textDecoration: 'none',
  color: 'inherit',
  background: 'var(--surface, #fff)',
};

/** قائمة تهيئة المكتب بعد أول دخول (تُخفى بزر أو بعد الإكمال). */
export function Onboarding() {
  const { can } = useSession();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;
  const steps = STEPS.filter((s) => !s.perm || can(s.perm));
  if (!steps.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <section className="panel2" style={{ marginBottom: 18 }}>
      <div className="ph" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3>خطوات تهيئة مكتبك</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={dismiss}>
          إخفاء
        </button>
      </div>
      <div className="pb">
        <div style={{ display: 'grid', gap: 10 }}>
          {steps.map((s, i) => (
            <Link key={s.to} to={s.to} style={stepStyle}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--green-50, #E8F1EC)',
                  color: 'var(--green, #0F4C3A)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  flex: '0 0 28px',
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>
                <b style={{ display: 'block' }}>{s.title}</b>
                <span style={{ color: 'var(--muted, #5F6B66)', fontSize: '.85rem' }}>{s.desc}</span>
              </span>
              <span style={{ color: 'var(--muted, #5F6B66)' }} aria-hidden="true">
                ←
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
