import { api } from '../lib/api';
import { useFetch, money } from '../lib/useFetch';

interface Row {
  id: number;
  code: string;
  title: string;
  type: string;
  offer: string;
  status: string;
  visibility: string;
  price: string;
}
const OFFER: Record<string, string> = { sale: 'بيع', rent: 'إيجار', investment: 'استثمار' };
const STATUS: Record<string, string> = { available: 'متاح', negotiation: 'تفاوض', reserved: 'محجوز', sold: 'مُباع', rented: 'مؤجّر' };
const VIS: Record<string, string> = { published: 'منشور', draft: 'مسودّة', archived: 'مؤرشف' };

export function Properties() {
  const { data, error, loading } = useFetch(() => api.get<{ items: Row[]; total: number }>('/admin/properties', true));

  return (
    <div className="card">
      <h2>العقارات {data ? `(${data.total})` : ''}</h2>
      {loading && <p className="muted">جارِ التحميل…</p>}
      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {data && data.items.length === 0 && <div className="empty">لا توجد عقارات.</div>}
      {data && data.items.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>الكود</th><th>العنوان</th><th>العرض</th><th>السعر</th><th>الحالة</th><th>النشر</th></tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td className="muted">{p.code}</td>
                <td>{p.title}</td>
                <td>{OFFER[p.offer] ?? p.offer}</td>
                <td>{money(p.price)}</td>
                <td><span className="pill">{STATUS[p.status] ?? p.status}</span></td>
                <td>{VIS[p.visibility] ?? p.visibility}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
