import { useEffect, useState } from 'react';
import { platformApi, type TenantRow } from '../../lib/api';

const STATUS_LABEL: Record<TenantRow['status'], string> = {
  trial: 'تجريبي',
  active: 'نشط',
  suspended: 'معلّق',
  cancelled: 'ملغى',
};

export function Tenants() {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi
      .tenants()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'خطأ'));
  }, []);

  return (
    <div className="card">
      <h2>المشتركون (مكاتب العقار)</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        كل صف هو مكتب عقاري له موقعه ولوحته المعزولة.
      </p>

      {error && <p className="muted">تعذّر التحميل: {error}</p>}
      {!rows && !error && <p className="muted">جارِ التحميل…</p>}
      {rows && rows.length === 0 && <div className="empty">لا يوجد مشتركون بعد.</div>}

      {rows && rows.length > 0 && (
        <table className="tbl">
          <thead>
            <tr>
              <th>المكتب</th>
              <th>المعرّف (slug)</th>
              <th>الكود</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="muted">{t.slug}</td>
                <td>{t.code}</td>
                <td>
                  <span className={`badge ${t.status}`}>{STATUS_LABEL[t.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
