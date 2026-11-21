import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';

const LABELS: Record<string, string> = {
  general: 'الإعدادات العامة', branding: 'الهوية والمظهر', contact: 'بيانات التواصل',
  licensing: 'التراخيص والاعتمادات', booking: 'الحجز', payments: 'طرق الدفع',
  bank_transfer: 'التحويل البنكي', notifications: 'الإشعارات', maps: 'الخرائط',
  locations: 'المدن والأحياء', features: 'المزايا', legal: 'الصفحات القانونية', seo: 'تهيئة محركات البحث',
};

export function Settings() {
  const { data, error, loading } = useFetch(() => api.get<Record<string, unknown>>('/admin/settings', true));

  return (
    <div className="card">
      <h2>الإعدادات</h2>
      {loading && <p className="muted">جارِ التحميل…</p>}
      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {data && (
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          {Object.keys(data).map((k) => (
            <div key={k} className="card" style={{ boxShadow: 'none' }}>
              <strong>{LABELS[k] ?? k}</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
