import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';

interface Row {
  id: string;
  number: string;
  type: string;
  stage: string;
  name: string;
  phone: string;
  property?: { title: string } | null;
  assignedTo?: { name: string } | null;
}
const TYPE: Record<string, string> = { viewing: 'معاينة', waitlist: 'انتظار', buy: 'شراء', rent: 'إيجار', list: 'عرض عقار', invest: 'استثمار', manage: 'إدارة', contact: 'تواصل' };
const STAGE: Record<string, string> = { new: 'جديد', contacted: 'تم التواصل', viewing: 'معاينة', negotiation: 'تفاوض', won: 'مكسوب', lost: 'مفقود' };

export function Leads() {
  const { data, error, loading } = useFetch(() => api.get<{ items: Row[]; total: number }>('/admin/leads', true));

  return (
    <div className="card">
      <h2>الطلبات {data ? `(${data.total})` : ''}</h2>
      {loading && <p className="muted">جارِ التحميل…</p>}
      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {data && data.items.length === 0 && <div className="empty">لا توجد طلبات.</div>}
      {data && data.items.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>الرقم</th><th>النوع</th><th>الاسم</th><th>الجوال</th><th>العقار</th><th>المسؤول</th><th>المرحلة</th></tr>
          </thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.id}>
                <td className="muted">{l.number}</td>
                <td>{TYPE[l.type] ?? l.type}</td>
                <td>{l.name}</td>
                <td dir="ltr">{l.phone}</td>
                <td>{l.property?.title ?? '—'}</td>
                <td>{l.assignedTo?.name ?? '—'}</td>
                <td><span className="pill">{STAGE[l.stage] ?? l.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
