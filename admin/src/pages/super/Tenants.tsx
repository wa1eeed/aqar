import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';

interface TenantRow {
  id: string;
  slug: string;
  code: string;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
}
const STATUS: Record<string, string> = { trial: 'تجريبي', active: 'نشط', suspended: 'معلّق', cancelled: 'ملغى' };

export function Tenants() {
  const { data, error, loading } = useFetch(() => api.get<TenantRow[]>('/super/tenants'));

  return (
    <div className="card">
      <h2>المشتركون (مكاتب العقار)</h2>
      <p className="muted" style={{ marginBottom: 16 }}>كل صف مكتب عقاري له موقعه ولوحته المعزولة.</p>
      {loading && <p className="muted">جارِ التحميل…</p>}
      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {data && data.length === 0 && <div className="empty">لا يوجد مشتركون بعد.</div>}
      {data && data.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>المكتب</th><th>المعرّف</th><th>الكود</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="muted">{t.slug}</td>
                <td>{t.code}</td>
                <td><span className={`badge ${t.status}`}>{STATUS[t.status] ?? t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
