import { statuses, statusesFor, types } from '@manzilah/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { LicensePill, OfferBadge, StatusPill, VisibilityPill } from '../components/Pills';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { csvCell } from '../lib/csv';
import { sar } from '../lib/format';
import type { AdminProperty, Paged, StaffMember } from '../lib/types';
import { FormError } from './LoginPage';

type Filters = {
  offer: string;
  q: string;
  types: string;
  status: string;
  agentId: string;
  license: string;
  visibility: string;
  page: number;
};
const EMPTY: Filters = { offer: '', q: '', types: '', status: '', agentId: '', license: '', visibility: '', page: 1 };

function query(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== '' && v !== undefined) p.set(k, String(v));
  p.set('pageSize', '20');
  return p.toString();
}

/** CSV export of the current result (UTF-8 BOM so Excel shows Arabic). Values are quoted; formula prefixes neutralised. */
function exportCsv(rows: AdminProperty[]) {
  const cell = csvCell;
  const head = [
    'الرقم',
    'العنوان',
    'النوع',
    'العرض',
    'الحالة',
    'السعر (ر.س)',
    'المدينة',
    'الحي',
    'المستشار',
    'النشر',
    'رقم ترخيص الإعلان',
  ];
  const lines = rows.map((p) =>
    [
      p.code,
      p.title,
      types[p.type as keyof typeof types]?.label,
      p.offer,
      statuses[p.status].label,
      p.price / 100,
      p.city.nameAr,
      p.district.nameAr,
      p.agent.name,
      p.visibility,
      p.adLicenseNo,
    ]
      .map(cell)
      .join(','),
  );
  const blob = new Blob([`\uFEFF${[head.map(cell).join(','), ...lines].join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `properties-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StatusModal({
  p,
  onClose,
  onDone,
}: {
  p: Pick<AdminProperty, 'id' | 'offer' | 'status' | 'title'>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<string>(p.status);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="تغيير حالة العقار" onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/admin/properties/${p.id}/status`, {
              body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) },
            });
            onDone();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذّر التحديث');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">{p.title}</p>
        <FormError error={error} />
        <div className="field">
          <label htmlFor="st">الحالة</label>
          <select id="st" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusesFor(p.offer).map((s) => (
              <option key={s} value={s}>
                {statuses[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rs">السبب (اختياري)</label>
          <input id="rs" className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy || status === p.status}>
          حفظ الحالة
        </button>
      </form>
    </Modal>
  );
}

export function PropertiesPage() {
  const { can, me } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Filters>(EMPTY);
  const [data, setData] = useState<Paged<AdminProperty> | null>(null);
  const [counts, setCounts] = useState<{ total: number; published: number; drafts: number } | null>(null);
  const [agents, setAgents] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [statusFor, setStatusFor] = useState<AdminProperty | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<Paged<AdminProperty>>(`/admin/properties?${query(f)}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [f]);

  const loadCounts = useCallback(async () => {
    const [all, pub, dr] = await Promise.all(
      ['', 'published', 'draft'].map((v) =>
        api<Paged<AdminProperty>>(`/admin/properties?pageSize=1${v ? `&visibility=${v}` : ''}`),
      ),
    );
    setCounts({ total: all!.total, published: pub!.total, drafts: dr!.total });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), f.q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, f.q]);
  useEffect(() => {
    void loadCounts().catch(() => undefined);
    if (can('staff.manage'))
      void api<{ items: StaffMember[] }>('/admin/staff')
        .then((r) => setAgents(r.items))
        .catch(() => undefined);
  }, [loadCounts, can]);

  const set = (patch: Partial<Filters>) => {
    setSelected(new Set());
    setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));
  };

  async function bulk(action: 'publish' | 'unpublish') {
    let ok = 0;
    const failed: string[] = [];
    for (const id of selected) {
      try {
        await api(`/admin/properties/${id}/${action}`, { body: {} });
        ok++;
      } catch (e) {
        failed.push(`MZ-${id}: ${e instanceof ApiError ? e.message : 'خطأ'}`);
      }
    }
    toast(failed.length ? `تم ${ok}، وتعذّر ${failed.length}: ${failed[0]}` : `تم تحديث ${ok} عقار`);
    setSelected(new Set());
    await Promise.all([load(), loadCounts()]);
  }

  const items = data?.items ?? [];
  const allChecked = items.length > 0 && items.every((p) => selected.has(p.id));
  const typeOptions = useMemo(() => Object.entries(types), []);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>العقارات</h1>
          <p>{counts ? `${counts.total} عقاراً · ${counts.published} منشور · ${counts.drafts} مسودات` : ' '}</p>
        </div>
        <div className="acts">
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => exportCsv(items)}
            disabled={!items.length}
          >
            <Icon name="doc" />
            تصدير CSV
          </button>
          {can('properties.create') ? (
            <Link className="btn btn--primary btn--sm" to="/properties/new">
              <Icon name="plus" />
              إضافة عقار
            </Link>
          ) : null}
        </div>
      </div>

      <div className="tools">
        <div className="seg" role="tablist" aria-label="نوع العرض">
          {[
            ['', 'الكل'],
            ['sale', 'للبيع'],
            ['rent', 'للإيجار'],
            ['investment', 'للاستثمار'],
          ].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={f.offer === v} onClick={() => set({ offer: v! })}>
              {l}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="بحث بالعنوان أو الرقم أو الحي"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="بحث"
        />
        <select className="select" value={f.types} onChange={(e) => set({ types: e.target.value })} aria-label="النوع">
          <option value="">كل الأنواع</option>
          {typeOptions.map(([k, t]) => (
            <option key={k} value={k}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={f.status}
          onChange={(e) => set({ status: e.target.value })}
          aria-label="الحالة"
        >
          <option value="">كل الحالات</option>
          {Object.entries(statuses).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
        {agents.length ? (
          <select
            className="select"
            value={f.agentId}
            onChange={(e) => set({ agentId: e.target.value })}
            aria-label="المستشار"
          >
            <option value="">كل المستشارين</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : me?.scope === 'own' ? (
          <select
            className="select"
            value={f.agentId}
            onChange={(e) => set({ agentId: e.target.value })}
            aria-label="المستشار"
          >
            <option value="">كل العقارات</option>
            <option value={me.staff.id}>عقاراتي</option>
          </select>
        ) : null}
        <select
          className="select"
          value={f.visibility}
          onChange={(e) => set({ visibility: e.target.value })}
          aria-label="النشر"
        >
          <option value="">منشور ومسودة</option>
          <option value="published">منشور</option>
          <option value="draft">مسودة</option>
        </select>
        <select
          className="select"
          value={f.license}
          onChange={(e) => set({ license: e.target.value })}
          aria-label="حالة الترخيص"
        >
          <option value="">حالة الترخيص</option>
          <option value="missing">ناقص</option>
          <option value="expiring">ينتهي خلال 30 يوماً</option>
          <option value="expired">منتهي</option>
        </select>
      </div>

      {selected.size && can('properties.publish') ? (
        <div className="bulk-bar" role="region" aria-label="إجراءات جماعية">
          <b>{selected.size} محدد</b>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void bulk('publish')}>
            نشر
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void bulk('unpublish')}>
            إلغاء النشر
          </button>
        </div>
      ) : null}

      <section className="panel2">
        {error ? (
          <div className="pb">
            <EmptyState title="تعذّر تحميل العقارات">{error}</EmptyState>
          </div>
        ) : !data ? (
          <div className="pb">
            <EmptyState icon="clock" title="جارٍ التحميل…" />
          </div>
        ) : !items.length ? (
          <div className="pb">
            <EmptyState icon="building" title="لا توجد عقارات مطابقة">
              غيّر عوامل التصفية أو أضف عقاراً جديداً.
            </EmptyState>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="تحديد الكل"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((p) => p.id)))}
                    />
                  </th>
                  <th />
                  <th>العقار</th>
                  <th>العرض</th>
                  <th>الحالة</th>
                  <th>السعر</th>
                  <th>الموقع</th>
                  <th>المستشار</th>
                  <th>النشر</th>
                  <th>الترخيص</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const cover = p.media.find((m) => m.status === 'ready' && m.kind === 'photo');
                  const thumb = cover?.variants?.webpThumb ?? cover?.variants?.thumb;
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`تحديد ${p.code}`}
                          checked={selected.has(p.id)}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(p.id)) n.delete(p.id);
                              else n.add(p.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td>
                        {thumb ? (
                          <img className="thumb" src={thumb} alt="" loading="lazy" />
                        ) : (
                          <span className="thumb thumb--empty" />
                        )}
                      </td>
                      <td>
                        <Link to={`/properties/${p.id}`} className="t" style={{ color: 'inherit' }}>
                          {p.title}
                        </Link>
                        <div className="s">
                          {p.code} · {types[p.type as keyof typeof types]?.label}
                        </div>
                      </td>
                      <td>
                        <OfferBadge offer={p.offer} />
                      </td>
                      <td>
                        {p.canEdit && can('properties.status') ? (
                          <button
                            type="button"
                            className="link-btn"
                            style={{ padding: 0 }}
                            onClick={() => setStatusFor(p)}
                            aria-label={`تغيير حالة ${p.code}`}
                          >
                            <StatusPill status={p.status} />
                          </button>
                        ) : (
                          <StatusPill status={p.status} />
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <b>{sar(p.price)}</b>
                        {p.rentPeriod ? (
                          <div className="s">{{ yearly: 'سنوي', monthly: 'شهري', daily: 'يومي' }[p.rentPeriod]}</div>
                        ) : null}
                      </td>
                      <td>
                        {p.district.nameAr}
                        <div className="s">{p.city.nameAr}</div>
                      </td>
                      <td title={p.agent.name}>
                        <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                          {p.agent.name.slice(0, 1)}
                        </span>
                      </td>
                      <td>
                        <VisibilityPill v={p.visibility} />
                      </td>
                      <td>
                        <LicensePill p={p} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`فتح ${p.code}`}
                          onClick={() => navigate(`/properties/${p.id}`)}
                        >
                          <Icon name="arrowL" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && data.pages > 1 ? (
        <nav className="pager" aria-label="الصفحات">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={f.page <= 1}
            onClick={() => set({ page: f.page - 1 })}
          >
            السابق
          </button>
          <span>
            صفحة {f.page} من {data.pages}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={f.page >= data.pages}
            onClick={() => set({ page: f.page + 1 })}
          >
            التالي
          </button>
        </nav>
      ) : null}

      {statusFor ? (
        <StatusModal
          p={statusFor}
          onClose={() => setStatusFor(null)}
          onDone={async () => {
            setStatusFor(null);
            toast('تم تحديث الحالة');
            await load();
          }}
        />
      ) : null}
    </>
  );
}
