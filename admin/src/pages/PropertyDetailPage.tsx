import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { sar, date, timeAgo } from '../lib/format';
import { OfferBadge, StatusPill, VisibilityPill } from '../components/Pills';
import { EmptyState } from '../components/States';
import { useSession } from '../app/session';

interface Prop {
  id: number;
  code: string;
  title: string;
  offer: string;
  type: string;
  status: string;
  visibility: 'draft' | 'published';
  price: string | number;
  area: number;
  city?: { nameAr: string } | null;
  district?: { nameAr: string } | null;
  agent?: { name: string } | null;
  media?: { id: string }[];
  createdAt: string;
  statusHistory?: { id: string; from: string; to: string; reason: string | null; createdAt: string; actorType: string }[];
}
interface Lead { id: string; number: string; name: string; phone: string; type: string; stage: string; createdAt: string }
interface Booking { id: string; number: string; status: string; createdAt: string }
interface AuditRow { id: string; action: string; actorType: string; createdAt: string }
interface Paged<T> { items: T[]; total: number }

type Tab = 'overview' | 'leads' | 'bookings' | 'timeline';
const TABS: Array<[Tab, string]> = [
  ['overview', 'نظرة عامة'],
  ['leads', 'الطلبات'],
  ['bookings', 'الحجوزات'],
  ['timeline', 'السجلّ الزمني'],
];
const AUDIT_AR: Record<string, string> = {
  'property.create': 'إنشاء العقار',
  'property.update': 'تعديل العقار',
  'property.status': 'تغيير الحالة',
  'property.publish': 'نشر',
  'property.unpublish': 'إخفاء',
};

export function PropertyDetailPage() {
  const { id } = useParams();
  const { can } = useSession();
  const [p, setP] = useState<Prop | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Prop>(`/admin/properties/${id}`)
      .then(setP)
      .catch(() => setError('تعذّر تحميل العقار'));
  }, [id]);

  useEffect(() => {
    if (tab === 'leads' && leads === null) {
      void api<Paged<Lead>>(`/admin/leads?propertyId=${id}&pageSize=50`)
        .then((r) => setLeads(r.items ?? []))
        .catch(() => setLeads([]));
    }
    if (tab === 'bookings' && bookings === null) {
      void api<Paged<Booking>>(`/admin/bookings?propertyId=${id}&pageSize=50`)
        .then((r) => setBookings(r.items ?? []))
        .catch(() => setBookings([]));
    }
    if (tab === 'timeline' && audit === null) {
      void api<AuditRow[]>(`/admin/audit?entityType=Property&entityId=${id}`)
        .then((r) => setAudit(Array.isArray(r) ? r : []))
        .catch(() => setAudit([]));
    }
  }, [tab, id, leads, bookings, audit]);

  if (error) return <EmptyState icon="building" title="خطأ">{error}</EmptyState>;
  if (!p) return <div className="panel2"><div className="pb">جارٍ التحميل…</div></div>;

  const fact = (label: string, value: React.ReactNode) => (
    <div className="field">
      <label>{label}</label>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 };

  // merge timeline: status history + audit
  const timeline: Array<{ t: string; kind: 'status' | 'audit'; from?: string; to?: string; reason?: string | null; action?: string }> = [
    ...(p.statusHistory ?? []).map((h) => ({ t: h.createdAt, kind: 'status' as const, from: h.from, to: h.to, reason: h.reason })),
    ...(audit ?? []).map((a) => ({ t: a.createdAt, kind: 'audit' as const, action: a.action })),
  ].sort((a, b) => (a.t < b.t ? 1 : -1));

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{p.title}</h1>
          <p>
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{p.code}</span> · {p.city?.nameAr ?? '—'}
            {p.district ? ` · ${p.district.nameAr}` : ''}
          </p>
        </div>
        <div className="acts" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <OfferBadge offer={p.offer} />
          <StatusPill status={p.status} />
          <VisibilityPill v={p.visibility} />
          {can('properties.edit') ? (
            <Link className="btn btn--primary btn--sm" to={`/properties/${p.id}/edit`}>
              تعديل
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="tabs2 panel2" style={{ marginBottom: 18 }}>
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)} type="button">
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="panel2">
          <div className="pb">
            <div style={grid}>
              {fact('السعر', <span style={{ color: 'var(--green)', fontWeight: 700 }}>{sar(Number(p.price))}</span>)}
              {fact('المساحة', `${p.area} م²`)}
              {fact('النوع', p.type)}
              {fact('العرض', <OfferBadge offer={p.offer} />)}
              {fact('الحالة', <StatusPill status={p.status} />)}
              {fact('الظهور', <VisibilityPill v={p.visibility} />)}
              {fact('المسؤول', p.agent?.name ?? 'غير مُسند')}
              {fact('الوسائط', `${p.media?.length ?? 0} ملف`)}
              {fact('أُضيف', date(p.createdAt))}
            </div>
          </div>
        </section>
      )}

      {tab === 'leads' && (
        <section className="panel2">
          <div className="pb">
            {leads === null ? (
              <p style={{ color: 'var(--muted)' }}>جارٍ التحميل…</p>
            ) : leads.length === 0 ? (
              <EmptyState icon="mail" title="لا طلبات على هذا العقار">تظهر طلبات العملاء المرتبطة بهذا العقار هنا.</EmptyState>
            ) : (
              <table className="tbl" style={{ width: '100%' }}>
                <thead><tr><th>الطلب</th><th>العميل</th><th>النوع</th><th>المرحلة</th><th>التاريخ</th></tr></thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td style={{ direction: 'ltr' }}>{l.number}</td>
                      <td>{l.name}<div style={{ direction: 'ltr', color: 'var(--muted)', fontSize: '.8rem' }}>{l.phone}</div></td>
                      <td>{l.type}</td>
                      <td>{l.stage}</td>
                      <td>{date(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {tab === 'bookings' && (
        <section className="panel2">
          <div className="pb">
            {bookings === null ? (
              <p style={{ color: 'var(--muted)' }}>جارٍ التحميل…</p>
            ) : bookings.length === 0 ? (
              <EmptyState icon="key" title="لا حجوزات على هذا العقار">تظهر حجوزات هذا العقار هنا.</EmptyState>
            ) : (
              <table className="tbl" style={{ width: '100%' }}>
                <thead><tr><th>الحجز</th><th>الحالة</th><th>التاريخ</th><th></th></tr></thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td style={{ direction: 'ltr' }}>{b.number}</td>
                      <td><StatusPill status={b.status} /></td>
                      <td>{date(b.createdAt)}</td>
                      <td><Link className="btn btn--ghost btn--sm" to={`/bookings/${b.id}`}>عرض</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {tab === 'timeline' && (
        <section className="panel2">
          <div className="pb">
            {audit === null ? (
              <p style={{ color: 'var(--muted)' }}>جارٍ التحميل…</p>
            ) : timeline.length === 0 ? (
              <EmptyState icon="list" title="لا عمليات بعد">يُسجَّل هنا كل تغيير على العقار (الحالة، النشر، التعديلات).</EmptyState>
            ) : (
              <div style={{ position: 'relative' }}>
                {timeline.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 2px', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', marginTop: 6, flex: '0 0 9px' }} />
                    <div style={{ flex: 1 }}>
                      {e.kind === 'status' ? (
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          تغيّرت الحالة من <StatusPill status={e.from!} /> إلى <StatusPill status={e.to!} />
                          {e.reason ? <i style={{ fontStyle: 'normal', color: 'var(--muted)', fontSize: '.82rem' }}>({e.reason})</i> : null}
                        </span>
                      ) : (
                        <b>{AUDIT_AR[e.action ?? ''] ?? e.action}</b>
                      )}
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '.8rem', whiteSpace: 'nowrap' }}>{timeAgo(e.t)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
