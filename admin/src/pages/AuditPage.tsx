import { useEffect, useState } from 'react';
import { EmptyState } from '../components/States';
import { api } from '../lib/api';
import { date } from '../lib/format';

interface Row {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: string;
  createdAt: string;
}

const ACTIONS: Record<string, string> = {
  'booking.create': 'إنشاء حجز',
  'booking.confirm': 'تأكيد حجز',
  'booking.cancel': 'إلغاء حجز',
  'payment.paid': 'دفعة مدفوعة',
  'payment.refund': 'استرداد دفعة',
  'payment.transfer.review': 'مراجعة تحويل',
  'property.create': 'إضافة عقار',
  'property.update': 'تعديل عقار',
  'property.status': 'تغيير حالة عقار',
  'property.publish': 'نشر عقار',
  'property.unpublish': 'إخفاء عقار',
  'lead.create': 'طلب جديد',
  'lead.update': 'تحديث طلب',
  'viewing.create': 'طلب معاينة',
  'settings.update': 'تحديث إعدادات',
  'staff.2fa.enable': 'تفعيل تحقّق ثنائي',
  'staff.create': 'إضافة موظف',
};
const ENTITY: Record<string, string> = {
  Property: 'عقار',
  Booking: 'حجز',
  Payment: 'دفعة',
  Lead: 'طلب',
  Viewing: 'معاينة',
  StaffUser: 'موظف',
  SettingsSection: 'إعدادات',
};
const ACTOR: Record<string, string> = { staff: 'موظف', platform: 'منصة', customer: 'عميل', system: 'النظام' };

export function AuditPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void api<Row[]>('/admin/audit')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]));
  }, []);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>سجل العمليات</h1>
          <p>كل تغيير في النظام — من نفّذ ماذا ومتى (أحدث ٢٠٠ عملية).</p>
        </div>
      </div>
      <section className="panel2">
        <div className="pb">
          {!rows ? (
            <p style={{ color: 'var(--muted)' }}>جارٍ التحميل…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon="list" title="لا عمليات بعد">تُسجَّل هنا كل العمليات تلقائياً بمجرد استخدام النظام.</EmptyState>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>العملية</th>
                    <th>الكيان</th>
                    <th>المنفّذ</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{ACTIONS[r.action] ?? r.action}</td>
                      <td>{ENTITY[r.entityType] ?? r.entityType}</td>
                      <td>{ACTOR[r.actorType] ?? r.actorType}</td>
                      <td>{date(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
