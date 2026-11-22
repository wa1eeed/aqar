import { leadSources, leadStages, leadTypes, type LeadType } from '@manzilah/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, download, fieldMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useRealtimeEvent } from '../lib/realtime';
import type { LeadRow, LeadStageKey, Paged } from '../lib/types';
import { LeadDrawer } from './LeadDrawer';
import { FormError } from './LoginPage';

type Column = { stage: LeadStageKey; total: number; items: LeadRow[] };
type Filters = { q: string; type: string; assignedToId: string; source: string; period: string };
const EMPTY: Filters = { q: '', type: '', assignedToId: '', source: '', period: '30' };

function queryString(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.type) p.set('type', f.type);
  if (f.assignedToId) p.set('assignedToId', f.assignedToId);
  if (f.source) p.set('source', f.source);
  if (f.period) p.set('from', new Date(Date.now() - Number(f.period) * 86_400_000).toISOString().slice(0, 10));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

const subtitle = (l: LeadRow) =>
  `${leadTypes[l.type as LeadType] ?? l.type}${l.property ? ` · ${l.property.title}` : ''}`;
const initial = (name?: string | null) => (name ? name.trim().slice(0, 1) : '—');

/** docs/07 §4 — kanban (drag between stages) + table, filters, manual lead, CSV export. */
export function LeadsPage() {
  const { can } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'board' | 'table'>(() => (params.get('view') === 'table' ? 'table' : 'board'));
  const [f, setF] = useState<Filters>(EMPTY);
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [table, setTable] = useState<Paged<LeadRow> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [lostFor, setLostFor] = useState<LeadRow | null>(null);
  const [creating, setCreating] = useState(false);
  const dragged = useRef<LeadRow | null>(null);
  const openId = params.get('open');

  const load = useCallback(async () => {
    setError(null);
    try {
      if (view === 'board')
        setColumns((await api<{ columns: Column[] }>(`/admin/leads/board?${queryString(f)}`)).columns);
      else
        setTable(await api<Paged<LeadRow>>(`/admin/leads?${queryString(f, { page: String(page), pageSize: '20' })}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الطلبات');
    }
  }, [view, f, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), f.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, f.q]);
  useEffect(() => {
    void api<{ items: Array<{ id: string; name: string }> }>('/admin/assignees?for=leads')
      .then((r) => setAssignees(r.items))
      .catch(() => undefined);
  }, []);
  useRealtimeEvent('lead.created', () => void load());
  useRealtimeEvent('lead.updated', () => void load());

  const set = (patch: Partial<Filters>) => {
    setPage(1);
    setF((x) => ({ ...x, ...patch }));
  };
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: !id });
  };

  const moveTo = async (lead: LeadRow, stage: LeadStageKey, lostReason?: string) => {
    if (lead.stage === stage) return;
    if (stage === 'lost' && !lostReason) {
      setLostFor(lead);
      return;
    }
    // Optimistic move; reverted by the reload on failure.
    setColumns(
      (cols) =>
        cols?.map((c) =>
          c.stage === stage
            ? { ...c, total: c.total + 1, items: [{ ...lead, stage }, ...c.items] }
            : c.stage === lead.stage
              ? { ...c, total: c.total - 1, items: c.items.filter((x) => x.id !== lead.id) }
              : c,
        ) ?? null,
    );
    try {
      await api(`/admin/leads/${lead.id}/stage`, { body: { stage, ...(lostReason ? { lostReason } : {}) } });
      toast(`نُقل الطلب إلى «${leadStages[stage].label}»`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر نقل الطلب');
    }
    void load();
  };

  const exportCsv = async () => {
    try {
      await download(`/admin/leads/export.csv?${queryString(f)}`, `leads-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر التصدير');
    }
  };

  const newToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return columns?.find((c) => c.stage === 'new')?.items.filter((l) => l.createdAt.slice(0, 10) === today).length ?? 0;
  }, [columns]);
  const openCount = columns?.filter((c) => !['won', 'lost'].includes(c.stage)).reduce((n, c) => n + c.total, 0) ?? 0;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الطلبات</h1>
          <p>
            {columns
              ? `${newToday} طلباً جديداً اليوم · ${openCount} طلباً مفتوحاً`
              : table
                ? `${table.total} طلباً`
                : ' '}
          </p>
        </div>
        <div className="acts">
          <div className="seg" role="tablist" aria-label="طريقة العرض">
            <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>
              <Icon name="grid" />
              لوحة
            </button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
              <Icon name="list" />
              جدول
            </button>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void exportCsv()}>
            <Icon name="doc" />
            تصدير
          </button>
          {can('leads.manage') ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
              <Icon name="plus" />
              طلب يدوي
            </button>
          ) : null}
        </div>
      </div>

      <div className="tools">
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="بحث بالاسم أو الجوال أو الرقم"
          aria-label="بحث"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select className="select" aria-label="النوع" value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">كل الأنواع</option>
          {Object.entries(leadTypes).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {assignees.length > 1 ? (
          <select
            className="select"
            aria-label="المسؤول"
            value={f.assignedToId}
            onChange={(e) => set({ assignedToId: e.target.value })}
          >
            <option value="">كل المسؤولين</option>
            <option value="none">بدون مسؤول</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="select"
          aria-label="المصدر"
          value={f.source}
          onChange={(e) => set({ source: e.target.value })}
        >
          <option value="">كل المصادر</option>
          {Object.entries(leadSources).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="الفترة"
          value={f.period}
          onChange={(e) => set({ period: e.target.value })}
        >
          <option value="7">آخر 7 أيام</option>
          <option value="30">آخر 30 يوماً</option>
          <option value="90">آخر 90 يوماً</option>
          <option value="">كل الفترات</option>
        </select>
      </div>

      <FormError error={error} />

      {view === 'board' ? (
        !columns ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : (
          <div className="kanban">
            {columns.map((c) => (
              <div
                key={c.stage}
                className="kcol"
                onDragOver={(e) => {
                  if (can('leads.manage')) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged.current) void moveTo(dragged.current, c.stage);
                  dragged.current = null;
                }}
              >
                <h4>
                  {leadStages[c.stage].label}
                  <span>{c.total}</span>
                </h4>
                {c.items.map((l) => (
                  <a
                    key={l.id}
                    className="kcard"
                    href={`?open=${l.id}`}
                    draggable={can('leads.manage')}
                    onDragStart={() => (dragged.current = l)}
                    onClick={(e) => {
                      e.preventDefault();
                      open(l.id);
                    }}
                  >
                    <div className="m">
                      <span dir="ltr">{l.number}</span>
                      <span className={`pill ${leadStages[l.stage].pill}`} style={{ height: 20 }}>
                        {leadStages[l.stage].label}
                      </span>
                    </div>
                    <b>{l.name}</b>
                    <span>{subtitle(l)}</span>
                    <div className="m">
                      <span className="av" title={l.assignedTo?.name ?? 'بدون مسؤول'}>
                        {initial(l.assignedTo?.name)}
                      </span>
                      <span>{l.stage === 'lost' && l.lostReason ? l.lostReason : timeAgo(l.updatedAt)}</span>
                    </div>
                  </a>
                ))}
                {c.total > c.items.length ? (
                  <small className="muted">و{c.total - c.items.length} أخرى — استخدم الجدول</small>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : !table ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : !table.items.length ? (
        <EmptyState title="لا توجد طلبات مطابقة" />
      ) : (
        <section className="panel2">
          <table className="tbl">
            <thead>
              <tr>
                <th>الطلب</th>
                <th>العميل</th>
                <th>النوع</th>
                <th>المرحلة</th>
                <th>المصدر</th>
                <th>المسؤول</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {table.items.map((l) => (
                <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => open(l.id)}>
                  <td className="t" dir="ltr" style={{ textAlign: 'right' }}>
                    {l.number}
                  </td>
                  <td>
                    <b>{l.name}</b>
                    <div className="s" dir="ltr" style={{ textAlign: 'right' }}>
                      {l.phone}
                    </div>
                  </td>
                  <td>{subtitle(l)}</td>
                  <td>
                    <span className={`pill ${leadStages[l.stage].pill}`}>{leadStages[l.stage].label}</span>
                  </td>
                  <td>{leadSources[l.source as keyof typeof leadSources] ?? l.source}</td>
                  <td>{l.assignedTo?.name ?? '—'}</td>
                  <td className="s">{timeAgo(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {table.pages > 1 ? (
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
                صفحة {page} من {table.pages}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={page >= table.pages}
                onClick={() => setPage(page + 1)}
              >
                التالي
              </button>
            </nav>
          ) : null}
        </section>
      )}

      {openId ? (
        <LeadDrawer id={openId} assignees={assignees} onClose={() => open(null)} onChanged={() => void load()} />
      ) : null}
      {lostFor ? (
        <LostReasonModal
          onClose={() => setLostFor(null)}
          onSubmit={(reason) => {
            const l = lostFor;
            setLostFor(null);
            void moveTo(l, 'lost', reason);
          }}
        />
      ) : null}
      {creating ? (
        <ManualLeadModal
          assignees={can('leads.assign') ? assignees : []}
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            toast('تم إنشاء الطلب');
            void load();
            open(id);
          }}
        />
      ) : null}
    </>
  );
}

export function LostReasonModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title="سبب عدم إتمام الصفقة" onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSubmit(reason.trim());
        }}
      >
        <div className="field">
          <label htmlFor="lost-reason">السبب</label>
          <input
            id="lost-reason"
            className="input"
            required
            maxLength={300}
            placeholder="مثال: السعر، اختار عقاراً آخر، لم يرد"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary btn--sm">
            نقل إلى «لم تتم»
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManualLeadModal({
  assignees,
  onClose,
  onDone,
}: {
  assignees: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [form, setForm] = useState({
    type: 'buy',
    source: 'phone',
    name: '',
    phone: '',
    email: '',
    propertyId: '',
    message: '',
    assignedToId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => (fields[k] ? <span className="field-error">{fieldMessage(fields[k])}</span> : null);

  return (
    <Modal title="طلب يدوي" onClose={onClose}>
      <form
        className="form2"
        style={{ marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setFields({});
          try {
            const r = await api<{ id: string }>('/admin/leads', {
              body: {
                type: form.type,
                source: form.source,
                name: form.name.trim(),
                phone: form.phone.trim(),
                ...(form.email.trim() ? { email: form.email.trim() } : {}),
                ...(form.propertyId ? { propertyId: Number(form.propertyId.replace(/\D/g, '')) } : {}),
                ...(form.message.trim() ? { message: form.message.trim() } : {}),
                ...(form.assignedToId ? { assignedToId: form.assignedToId } : {}),
              },
            });
            onDone(r.id);
          } catch (e2) {
            if (e2 instanceof ApiError) {
              setError(e2.message);
              setFields(e2.fields);
            } else setError('تعذّر الحفظ');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="full">
          <FormError error={error} />
        </div>
        <div className="field">
          <label htmlFor="ml-type">النوع</label>
          <select id="ml-type" className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(leadTypes).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ml-source">المصدر</label>
          <select id="ml-source" className="select" value={form.source} onChange={(e) => set('source', e.target.value)}>
            {(['phone', 'whatsapp', 'walk_in', 'admin'] as const).map((k) => (
              <option key={k} value={k}>
                {leadSources[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ml-name">الاسم *</label>
          <input
            id="ml-name"
            className="input"
            required
            minLength={2}
            maxLength={80}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          {err('name')}
        </div>
        <div className="field">
          <label htmlFor="ml-phone">الجوال *</label>
          <input
            id="ml-phone"
            className="input"
            dir="ltr"
            inputMode="tel"
            required
            placeholder="05XXXXXXXX"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          {err('phone')}
        </div>
        <div className="field">
          <label htmlFor="ml-email">البريد</label>
          <input
            id="ml-email"
            className="input"
            dir="ltr"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          {err('email')}
        </div>
        <div className="field">
          <label htmlFor="ml-prop">رقم العقار (اختياري)</label>
          <input
            id="ml-prop"
            className="input"
            dir="ltr"
            inputMode="numeric"
            placeholder="1001"
            value={form.propertyId}
            onChange={(e) => set('propertyId', e.target.value)}
          />
        </div>
        {assignees.length ? (
          <div className="field full">
            <label htmlFor="ml-assignee">المسؤول</label>
            <select
              id="ml-assignee"
              className="select"
              value={form.assignedToId}
              onChange={(e) => set('assignedToId', e.target.value)}
            >
              <option value="">تلقائي (مستشار العقار)</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field full">
          <label htmlFor="ml-msg">ملاحظات</label>
          <textarea
            id="ml-msg"
            className="textarea"
            maxLength={2000}
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
          />
        </div>
        <div className="full" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            إنشاء الطلب
          </button>
        </div>
      </form>
    </Modal>
  );
}
