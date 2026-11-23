import { useEffect, useState } from 'react';
import { EmptyState } from '../components/States';
import { Onboarding } from '../components/Onboarding';
import { useSession } from '../app/session';
import { api } from '../lib/api';
import { sar, timeAgo } from '../lib/format';

interface Stats {
  propertiesTotal: number;
  propertiesPublished: number;
  leadsToday: number;
  viewingsUpcoming: number;
  bookingsMonth: number;
  paymentsMonth: number;
  transfersPending: number;
}
interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

const ACTIONS: Record<string, string> = {
  'booking.create': 'حجز جديد',
  'booking.confirm': 'تأكيد حجز',
  'booking.cancel': 'إلغاء حجز',
  'payment.paid': 'دفعة مدفوعة',
  'payment.refund': 'استرداد دفعة',
  'property.create': 'إضافة عقار',
  'property.status': 'تغيير حالة عقار',
  'property.publish': 'نشر عقار',
  'property.unpublish': 'إخفاء عقار',
  'lead.create': 'طلب جديد',
  'viewing.create': 'طلب معاينة',
  'settings.update': 'تحديث إعدادات',
  'staff.2fa.enable': 'تفعيل تحقّق ثنائي',
};
const ENTITY: Record<string, string> = {
  Property: 'عقار',
  Booking: 'حجز',
  Payment: 'دفعة',
  Lead: 'طلب',
  Viewing: 'معاينة',
  StaffUser: 'موظف',
};

export function DashboardPage() {
  const { me } = useSession();
  const today = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'full' }).format(new Date());
  const [s, setS] = useState<Stats | null>(null);
  const [act, setAct] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    void api<Stats>('/admin/dashboard').then(setS).catch(() => undefined);
    void api<AuditRow[]>('/admin/audit')
      .then((r) => setAct(Array.isArray(r) ? r.slice(0, 8) : []))
      .catch(() => setAct([]));
  }, []);

  const kpis: Array<{ label: string; value: string; sub?: string }> = s
    ? [
        { label: 'عقارات منشورة', value: String(s.propertiesPublished), sub: `من ${s.propertiesTotal}` },
        { label: 'طلبات اليوم', value: String(s.leadsToday) },
        { label: 'معاينات قادمة', value: String(s.viewingsUpcoming) },
        { label: 'حجوزات هذا الشهر', value: String(s.bookingsMonth) },
        { label: 'مدفوعات الشهر', value: sar(s.paymentsMonth) },
        { label: 'تحويلات بانتظار المراجعة', value: String(s.transfersPending) },
      ]
    : [];

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 2px',
    borderBottom: '1px solid var(--line, #E4DBCC)',
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>مرحباً، {me?.staff.name}</h1>
          <p>{today} · ملخص أداء منشأتك</p>
        </div>
      </div>
      <Onboarding />
      <div className="kpis2">
        {(s ? kpis : Array.from({ length: 6 })).map((k, i) => (
          <div className="kpi2" key={i}>
            <span>{k ? (k as { label: string }).label : '…'}</span>
            <b>{k ? (k as { value: string }).value : '—'}</b>
            {k && (k as { sub?: string }).sub ? <em>{(k as { sub?: string }).sub}</em> : null}
          </div>
        ))}
      </div>
      <section className="panel2">
        <div className="ph">
          <h3>آخر العمليات</h3>
        </div>
        <div className="pb">
          {!act ? (
            <p style={{ color: 'var(--muted, #5F6B66)' }}>جارٍ التحميل…</p>
          ) : act.length === 0 ? (
            <EmptyState icon="list" title="لا نشاط بعد">
              تظهر آخر العمليات (الحجوزات، المدفوعات، العقارات…) هنا بمجرد حدوثها.
            </EmptyState>
          ) : (
            <div>
              {act.map((a) => (
                <div key={a.id} style={rowStyle}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--green, #0F4C3A)',
                      flex: '0 0 8px',
                    }}
                  />
                  <span style={{ flex: 1 }}>
                    <b>{ACTIONS[a.action] || a.action}</b>
                    {a.entityType ? (
                      <i style={{ fontStyle: 'normal', color: 'var(--muted, #5F6B66)', fontSize: '.85rem' }}>
                        {' · '}
                        {ENTITY[a.entityType] || a.entityType}
                      </i>
                    ) : null}
                  </span>
                  <span style={{ color: 'var(--muted, #5F6B66)', fontSize: '.82rem' }}>{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
