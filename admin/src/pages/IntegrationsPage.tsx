import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HealthPill } from '../components/HealthPill';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { IntegrationSummary } from '../lib/types';

/** Category groups in the order of design/screenshots/a-integrations.png. */
const GROUPS: Array<[string, string[]]> = [
  ['الخرائط', ['maps']],
  ['الأماكن القريبة', ['places']],
  ['المدفوعات', ['payments']],
  ['البريد والتخزين', ['email', 'storage']],
  ['الجهات الحكومية والهوية', ['government', 'identity']],
  ['الرسائل النصية', ['sms']],
];

const BADGE: Record<string, string> = {
  'maps.osm': 'OSM',
  'maps.google': 'G',
  'places.overpass': 'OV',
  'places.google': 'GP',
  'payments.moyasar': 'م',
  'payments.rize': 'R',
  'email.resend': 'Re',
  'storage.r2': 'R2',
  'gov.rega': 'هـ',
  'gov.ejar': 'إ',
  'identity.nafath': 'ن',
  'gov.nafith': 'ذ',
};

export function IntegrationsPage() {
  const [items, setItems] = useState<IntegrationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: IntegrationSummary[] }>('/admin/integrations')).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(i: IntegrationSummary) {
    try {
      await api(`/admin/integrations/${i.key}/${i.enabled ? 'disable' : 'enable'}`, { method: 'POST', body: {} });
      toast(i.enabled ? `تم تعطيل ${i.nameAr}` : `تم تفعيل ${i.nameAr}`);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر التحديث');
    }
  }

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>التكاملات</h1>
          <p>كل الاتصالات الخارجية تمر عبر API Gateway · المفاتيح مشفّرة ولا تُعرض بعد الحفظ</p>
        </div>
      </div>
      {error ? (
        <section className="panel2">
          <div className="pb">
            <EmptyState title="تعذّر تحميل التكاملات">{error}</EmptyState>
          </div>
        </section>
      ) : !items ? (
        <section className="panel2">
          <div className="pb">
            <EmptyState icon="clock" title="جارٍ التحميل…" />
          </div>
        </section>
      ) : (
        GROUPS.map(([label, cats]) => {
          const list = items.filter((i) => cats.includes(i.category));
          if (!list.length) return null;
          return (
            <div key={label}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>{label}</h3>
              <div className="icards">
                {list.map((i) => (
                  <div className="icard" key={i.key}>
                    <Link className="hd" to={`/integrations/${i.key}`}>
                      <span className="lg">{BADGE[i.key] ?? 'SMS'}</span>
                      <div>
                        <b>{i.nameAr}</b>
                        <div className="s muted">{i.descriptionAr}</div>
                      </div>
                    </Link>
                    <div className="ft">
                      <HealthPill health={i.health} enabled={i.enabled} prepared={i.prepared} />
                      <button
                        type="button"
                        className={`switch${i.enabled ? ' on' : ''}`}
                        role="switch"
                        aria-checked={i.enabled}
                        aria-label={`${i.enabled ? 'تعطيل' : 'تفعيل'} ${i.nameAr}`}
                        disabled={i.prepared}
                        onClick={() => void toggle(i)}
                      />
                    </div>
                    <div className="ft">
                      <span>البيئة: {i.environment === 'live' ? 'مباشر' : 'تجريبي'}</span>
                      <span>آخر فحص {timeAgo(i.healthCheckedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
