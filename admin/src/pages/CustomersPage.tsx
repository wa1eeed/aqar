import { leadStages, leadTypes, viewingStatuses, type LeadType } from '@manzilah/schema';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, download } from '../lib/api';
import { date, dayLabel, phoneLabel, timeAgo } from '../lib/format';
import type { CustomerRow, LeadStageKey, Paged } from '../lib/types';
import { FormError } from './LoginPage';

interface CustomerDetail {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    nafathVerified: boolean;
    marketingConsent: boolean;
    status: CustomerRow['status'];
    createdAt: string;
    lastLoginAt: string | null;
  };
  leads: Array<{
    id: string;
    number: string;
    type: string;
    stage: LeadStageKey;
    createdAt: string;
    property: { title: string } | null;
  }>;
  viewings: Array<{ id: string; scheduledAt: string; status: string; property: { id: number; title: string } }>;
  favorites: Array<{ createdAt: string; property: { id: number; code: string; title: string } }>;
  savedSearches: Array<{ id: string; name: string; alertEnabled: boolean }>;
}

const STATUS: Record<CustomerRow['status'], [string, string]> = {
  active: ['نشط', 'p-green'],
  blocked: ['محظور', 'p-red'],
  deleted: ['طلب حذف', 'p-gray'],
};

/** docs/07 §7 — customers list and profile. */
export function CustomersPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<CustomerRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openId = params.get('open');

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) p.set('q', q.trim());
      if (status) p.set('status', status);
      setData(await api<Paged<CustomerRow>>(`/admin/customers?${p}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [q, status, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next);
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>العملاء</h1>
          <p>{data ? `${data.total} عميلاً` : ' '}</p>
        </div>
        <div className="acts">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              void download(
                '/admin/customers/export.csv',
                `customers-${new Date().toISOString().slice(0, 10)}.csv`,
              ).catch((e) => toast(e instanceof ApiError ? e.message : 'تعذّر التصدير'))
            }
          >
            <Icon name="doc" />
            تصدير
          </button>
        </div>
      </div>
      <div className="tools">
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="بحث بالاسم أو الجوال أو البريد"
          aria-label="بحث"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="select"
          aria-label="الحالة"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="blocked">محظور</option>
          <option value="deleted">طلب حذف</option>
        </select>
      </div>
      <FormError error={error} />
      {!data ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : !data.items.length ? (
        <EmptyState icon="user" title="لا يوجد عملاء" />
      ) : (
        <section className="panel2">
          <table className="tbl">
            <thead>
              <tr>
                <th>العميل</th>
                <th>الجوال</th>
                <th>البريد</th>
                <th>الطلبات</th>
                <th>الحجوزات</th>
                <th>التوثيق</th>
                <th>آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => open(c.id)}>
                  <td>
                    <span className="av">{c.name.slice(0, 1)}</span> <b>{c.name}</b>
                    {c.status !== 'active' ? (
                      <span className={`pill ${STATUS[c.status][1]}`} style={{ marginInlineStart: 8 }}>
                        {STATUS[c.status][0]}
                      </span>
                    ) : null}
                  </td>
                  <td dir="ltr" style={{ textAlign: 'right' }}>
                    {phoneLabel(c.phone)}
                  </td>
                  <td>{c.email ?? '—'}</td>
                  <td>{c.leadsCount}</td>
                  <td>{c.bookingsCount}</td>
                  <td>
                    {c.emailVerifiedAt ? <span className="pill p-green">✓ بريد</span> : null}{' '}
                    {c.nafathVerifiedAt ? <span className="pill p-green">✓ نفاذ</span> : null}
                  </td>
                  <td className="s">{timeAgo(c.lastLoginAt ?? c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages > 1 ? (
            <nav className="pager" aria-label="الصفحات">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                السابق
              </button>
              <span>
                صفحة {page} من {data.pages}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                التالي
              </button>
            </nav>
          ) : null}
        </section>
      )}
      {openId ? <CustomerDrawer id={openId} onClose={() => open(null)} onChanged={() => void load()} /> : null}
    </>
  );
}

function CustomerDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const [d, setD] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<CustomerDetail>(`/admin/customers/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [id]);
  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [load, onClose]);

  const setStatus = async (status: 'active' | 'blocked') => {
    if (status === 'blocked' && !window.confirm('حظر العميل؟ سيُسجَّل خروجه من جميع الأجهزة.')) return;
    try {
      setD(await api<CustomerDetail>(`/admin/customers/${id}`, { method: 'PATCH', body: { status } }));
      toast(status === 'blocked' ? 'تم حظر العميل' : 'تم إلغاء الحظر');
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    }
  };

  const c = d?.customer;
  return (
    <>
      <div className="veil" onClick={onClose} />
      <aside className="drawer2" role="dialog" aria-modal="true" aria-label="ملف العميل">
        <div className="dh">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="avatar" style={{ width: 44, height: 44 }}>
              {c?.name.slice(0, 1) ?? ''}
            </span>
            <div>
              <b style={{ fontSize: 20 }}>{c?.name ?? '…'}</b>
              <div className="s muted">{c ? `عميل منذ ${date(c.createdAt)}` : ''}</div>
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="db">
          {error ? <p className="field-error">{error}</p> : null}
          {!d || !c ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={`pill ${STATUS[c.status][1]}`}>{STATUS[c.status][0]}</span>
                {c.emailVerified ? <span className="pill p-green">✓ البريد موثّق</span> : null}
                {c.phoneVerified ? <span className="pill p-green">✓ الجوال موثّق</span> : null}
                {c.nafathVerified ? <span className="pill p-green">✓ نفاذ</span> : null}
              </div>
              <div className="cmp">
                <div className="k">الجوال</div>
                <div dir="ltr" style={{ textAlign: 'right' }}>
                  {phoneLabel(c.phone)}
                </div>
                <div className="k">البريد</div>
                <div dir="ltr" style={{ textAlign: 'right' }}>
                  {c.email ?? '—'}
                </div>
                <div className="k">آخر دخول</div>
                <div>{timeAgo(c.lastLoginAt)}</div>
                <div className="k">الرسائل التسويقية</div>
                <div>{c.marketingConsent ? 'موافق' : 'غير موافق'}</div>
              </div>
              {c.phone ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <a className="btn btn--ghost btn--sm" href={`tel:${c.phone}`}>
                    <Icon name="phone" />
                    اتصال
                  </a>
                  <a
                    className="btn btn--wa btn--sm"
                    href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="whatsapp" />
                    واتساب
                  </a>
                </div>
              ) : null}

              <Section title={`الطلبات (${d.leads.length})`}>
                {d.leads.map((l) => (
                  <li key={l.id}>
                    <Link to={`/leads?open=${l.id}`}>{l.number}</Link> · {leadTypes[l.type as LeadType] ?? l.type}
                    {l.property ? ` · ${l.property.title}` : ''}{' '}
                    <span className={`pill ${leadStages[l.stage].pill}`}>{leadStages[l.stage].label}</span>
                  </li>
                ))}
              </Section>
              <Section title={`المعاينات (${d.viewings.length})`}>
                {d.viewings.map((v) => (
                  <li key={v.id}>
                    {dayLabel(v.scheduledAt)} · {v.property.title}{' '}
                    <span
                      className={`pill ${viewingStatuses[v.status as keyof typeof viewingStatuses]?.pill ?? 'p-gray'}`}
                    >
                      {viewingStatuses[v.status as keyof typeof viewingStatuses]?.label ?? v.status}
                    </span>
                  </li>
                ))}
              </Section>
              <Section title={`المفضلة (${d.favorites.length})`}>
                {d.favorites.map((f) => (
                  <li key={f.property.id}>
                    <Link to={`/properties/${f.property.id}`}>
                      {f.property.code} · {f.property.title}
                    </Link>
                  </li>
                ))}
              </Section>
              <Section title={`البحوث المحفوظة (${d.savedSearches.length})`}>
                {d.savedSearches.map((s) => (
                  <li key={s.id}>
                    {s.name} {s.alertEnabled ? <span className="pill p-blue">تنبيه</span> : null}
                  </li>
                ))}
              </Section>
              <p className="muted">الحجوزات والمدفوعات تظهر هنا بعد تفعيل الحجز.</p>

              {can('customers.manage') ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {c.status === 'active' ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ color: 'var(--st-sold)' }}
                      onClick={() => void setStatus('blocked')}
                    >
                      حظر العميل
                    </button>
                  ) : c.status === 'blocked' ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void setStatus('active')}>
                      إلغاء الحظر
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                      void download(`/admin/customers/${id}/export`, `customer-${id}.json`).catch((e) =>
                        toast(e instanceof ApiError ? e.message : 'تعذّر التصدير'),
                      )
                    }
                  >
                    <Icon name="doc" />
                    تصدير بيانات العميل (PDPL)
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <b style={{ fontSize: 14 }}>{title}</b>
      {children.length ? (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '8px 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 13,
          }}
        >
          {children}
        </ul>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          لا يوجد
        </p>
      )}
    </div>
  );
}
