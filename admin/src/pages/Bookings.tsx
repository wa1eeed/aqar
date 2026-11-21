import { api } from '../lib/api';
import { useFetch, money } from '../lib/useFetch';

interface Row {
  id: string;
  number: string;
  status: string;
  paymentMethod: string;
  amountDue: string;
  amountPaid: string;
  property?: { title: string } | null;
  customer?: { name: string } | null;
}
const STATUS: Record<string, string> = {
  pending_payment: 'بانتظار الدفع', awaiting_transfer_review: 'مراجعة تحويل', confirmed: 'مؤكّد',
  completed: 'مكتمل', cancelled: 'ملغى', expired: 'منتهٍ', refunded: 'مسترد',
};
const METHOD: Record<string, string> = { moyasar: 'إلكتروني', bank_transfer: 'تحويل بنكي', rize: 'رايز' };

export function Bookings() {
  const { data, error, loading } = useFetch(() => api.get<Row[]>('/admin/bookings', true));

  return (
    <div className="card">
      <h2>الحجوزات {data ? `(${data.length})` : ''}</h2>
      {loading && <p className="muted">جارِ التحميل…</p>}
      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {data && data.length === 0 && <div className="empty">لا توجد حجوزات.</div>}
      {data && data.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>الرقم</th><th>العقار</th><th>العميل</th><th>الطريقة</th><th>المستحق</th><th>المدفوع</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id}>
                <td className="muted">{b.number}</td>
                <td>{b.property?.title ?? '—'}</td>
                <td>{b.customer?.name ?? '—'}</td>
                <td>{METHOD[b.paymentMethod] ?? b.paymentMethod}</td>
                <td>{money(b.amountDue)}</td>
                <td>{money(b.amountPaid)}</td>
                <td><span className="pill">{STATUS[b.status] ?? b.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
