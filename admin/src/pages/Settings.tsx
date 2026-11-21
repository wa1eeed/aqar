import { useEffect, useState } from 'react';
import { officeApi } from '../lib/api';

const LABELS: Record<string, string> = {
  general: 'الإعدادات العامة',
  branding: 'الهوية والمظهر',
  contact: 'بيانات التواصل',
  licensing: 'التراخيص والاعتمادات',
  booking: 'الحجز',
  payments: 'طرق الدفع',
  bank_transfer: 'التحويل البنكي',
  notifications: 'الإشعارات',
  maps: 'الخرائط',
  locations: 'المدن والأحياء',
  features: 'المزايا',
  legal: 'الصفحات القانونية',
  seo: 'تهيئة محركات البحث',
};

export function Settings() {
  const [keys, setKeys] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    officeApi
      .settings()
      .then((s) => setKeys(Object.keys(s)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'خطأ'));
  }, []);

  return (
    <div className="card">
      <h2>الإعدادات</h2>
      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {!keys && !error && <p className="muted">جارِ التحميل…</p>}
      {keys && (
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          {keys.map((k) => (
            <div key={k} className="card" style={{ boxShadow: 'none' }}>
              <strong>{LABELS[k] ?? k}</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {k}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
