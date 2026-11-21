import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';

interface Stats {
  total: number;
  byType: Record<string, number>;
  byOffer: Record<string, number>;
}
const OFFER: Record<string, string> = { sale: 'للبيع', rent: 'للإيجار', investment: 'للاستثمار' };

export function Dashboard() {
  const { data, error } = useFetch(() => api.get<Stats>('/public/stats', true));

  const offerCards = data
    ? Object.entries(data.byOffer).map(([k, v]) => ({ n: String(v), l: OFFER[k] ?? k }))
    : [];

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="grid cols-3">
        <div className="card stat">
          <div className="n">{data ? data.total : '—'}</div>
          <div className="l">العقارات المنشورة</div>
        </div>
        {offerCards.map((s) => (
          <div key={s.l} className="card stat">
            <div className="n">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>أهلاً بك في لوحة منزلة</h2>
        <p className="muted">
          {error ? `تعذّر تحميل الإحصاءات: ${error}` : 'نظرة سريعة على عقاراتك المنشورة. تصفّح العقارات والطلبات والحجوزات من القائمة.'}
        </p>
      </div>
    </div>
  );
}
