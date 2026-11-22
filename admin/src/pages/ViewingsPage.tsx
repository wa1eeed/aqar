import { viewingStatuses } from '@manzilah/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { ViewingModal } from '../components/ViewingModal';
import { api, ApiError } from '../lib/api';
import { dayLabel, timeLabel } from '../lib/format';
import type { ViewingRow } from '../lib/types';
import { FormError } from './LoginPage';

const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 ص … 9 م (Riyadh)
const DAY_MS = 86_400_000;
const EV_CLASS: Record<ViewingRow['status'], string> = {
  confirmed: 'e1',
  requested: 'e2',
  completed: 'e4',
  no_show: 'e5',
  cancelled: 'e4',
};
const hourLabel = (h: number) => (h < 12 ? `${h} ص` : h === 12 ? '12 م' : `${h - 12} م`);
/** Riyadh midnight of the week's Sunday containing `d` (weeks start on Sunday in KSA). */
function weekStart(d: Date): Date {
  const local = new Date(d.getTime() + 3 * 3600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - local.getUTCDay() * DAY_MS - 3 * 3600_000);
}
const riyadh = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return { day: Math.floor(d.getTime() / DAY_MS), hour: d.getUTCHours(), min: d.getUTCMinutes() };
};
const dayKey = (d: Date) => Math.floor((d.getTime() + 3 * 3600_000) / DAY_MS);
const MONTH = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Riyadh',
});
const WEEKDAY = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/** docs/07 §5 — week/day calendar and list, per agent, colour per status. */
export function ViewingsPage() {
  const { can } = useSession();
  const toast = useToast();
  const [mode, setMode] = useState<'day' | 'week' | 'list'>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [items, setItems] = useState<ViewingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ViewingRow | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === 'day') {
      const s = weekStart(anchor);
      const from = new Date(s.getTime() + (dayKey(anchor) - dayKey(s)) * DAY_MS);
      return { from, to: new Date(from.getTime() + DAY_MS), days: [from] };
    }
    const from = weekStart(anchor);
    const span = mode === 'list' ? 28 : 7;
    return {
      from,
      to: new Date(from.getTime() + span * DAY_MS),
      days: Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * DAY_MS)),
    };
  }, [mode, anchor]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      if (agentId) q.set('agentId', agentId);
      setItems((await api<{ items: ViewingRow[] }>(`/admin/viewings?${q}`)).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تحميل المواعيد');
    }
  }, [range, agentId]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void api<{ items: Array<{ id: string; name: string }> }>('/admin/assignees?for=viewings')
      .then((r) => setAgents(r.items))
      .catch(() => undefined);
  }, []);

  const quick = async (v: ViewingRow, status: ViewingRow['status'], msg: string) => {
    try {
      await api(`/admin/viewings/${v.id}`, { method: 'PATCH', body: { status } });
      toast(msg);
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    }
  };

  const step = (dir: -1 | 1) => setAnchor((a) => new Date(a.getTime() + dir * (mode === 'day' ? 1 : 7) * DAY_MS));
  const title =
    mode === 'day'
      ? dayLabel(range.from)
      : `الأسبوع ${MONTH.format(range.from)} – ${MONTH.format(new Date(range.from.getTime() + 6 * DAY_MS))}`;

  const cell = (day: Date, hour: number) =>
    (items ?? []).filter((v) => {
      const r = riyadh(v.scheduledAt);
      return r.day === dayKey(day) && r.hour === hour;
    });

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>المعاينات</h1>
          <p>{title}</p>
        </div>
        <div className="acts">
          <div className="seg" role="tablist" aria-label="طريقة العرض">
            {(
              [
                ['day', 'يوم'],
                ['week', 'أسبوع'],
                ['list', 'قائمة'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>
                {l}
              </button>
            ))}
          </div>
          {agents.length > 1 ? (
            <select
              className="select"
              aria-label="المستشار"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">كل المستشارين</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
          {can('viewings.manage') ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating('')}>
              <Icon name="plus" />
              موعد جديد
            </button>
          ) : null}
        </div>
      </div>
      <div className="tools">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => step(-1)} aria-label="السابق">
          <Icon name="chevR" />
          السابق
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAnchor(new Date())}>
          اليوم
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => step(1)} aria-label="التالي">
          التالي
          <Icon name="chevL" />
        </button>
      </div>
      <FormError error={error} />

      {mode === 'list' ? (
        !items ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : !items.length ? (
          <EmptyState icon="calendar" title="لا توجد مواعيد في هذه الفترة" />
        ) : (
          <section className="panel2">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الموعد</th>
                  <th>العقار</th>
                  <th>العميل</th>
                  <th>المستشار</th>
                  <th>الحالة</th>
                  <th aria-label="إجراءات" />
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <b>{dayLabel(v.scheduledAt)}</b>
                      <div className="s">{timeLabel(v.scheduledAt)}</div>
                    </td>
                    <td>
                      <Link to={`/properties/${v.property.id}`}>{v.property.title}</Link>
                      <div className="s">{v.property.code}</div>
                    </td>
                    <td>
                      {v.customer?.name ?? v.lead?.name ?? '—'}
                      {v.lead ? (
                        <div className="s">
                          <Link to={`/leads?open=${v.lead.id}`}>{v.lead.number}</Link>
                        </div>
                      ) : null}
                    </td>
                    <td>{v.agent.name}</td>
                    <td>
                      <span className={`pill ${viewingStatuses[v.status].pill}`}>
                        {viewingStatuses[v.status].label}
                      </span>
                    </td>
                    <td>
                      <QuickActions v={v} onQuick={quick} onEdit={() => setEditing(v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      ) : (
        <section className="panel2" style={{ overflowX: 'auto' }}>
          <div
            className="cal"
            style={{
              gridTemplateColumns: `60px repeat(${range.days.length}, minmax(${mode === 'day' ? 240 : 110}px, 1fr))`,
            }}
          >
            <div className="h" />
            {range.days.map((d) => (
              <div className="h" key={d.toISOString()}>
                {WEEKDAY.format(d)}
              </div>
            ))}
            {HOURS.map((h) => (
              <div key={h} style={{ display: 'contents' }}>
                <div className="tm">{hourLabel(h)}</div>
                {range.days.map((d) => {
                  const evs = cell(d, h);
                  return (
                    <div
                      className="c"
                      key={d.toISOString()}
                      onDoubleClick={() =>
                        can('viewings.manage') &&
                        setCreating(new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10))
                      }
                    >
                      {evs.map((v, i) => (
                        <button
                          type="button"
                          key={v.id}
                          className={`ev ${EV_CLASS[v.status]}`}
                          style={{
                            insetInlineStart: `${4 + (i * 100) / evs.length}%`,
                            width: `calc(${100 / evs.length}% - 8px)`,
                            textAlign: 'right',
                            cursor: 'pointer',
                            textDecoration: v.status === 'cancelled' ? 'line-through' : undefined,
                          }}
                          title={`${timeLabel(v.scheduledAt)} · ${viewingStatuses[v.status].label}`}
                          onClick={() => setEditing(v)}
                        >
                          {v.property.title} · {v.customer?.name ?? v.lead?.name ?? v.agent.name}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="tools">
        {(['confirmed', 'requested', 'no_show', 'completed'] as const).map((s) => (
          <span key={s} className={`pill ${viewingStatuses[s].pill}`}>
            <i />
            {viewingStatuses[s].label}
          </span>
        ))}
      </div>

      {editing ? (
        <ViewingModal
          viewing={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast('تم حفظ الموعد');
            void load();
          }}
        />
      ) : null}
      {creating !== null ? (
        <ViewingModal
          preset={{ date: creating }}
          onClose={() => setCreating(null)}
          onDone={() => {
            setCreating(null);
            toast('تم إنشاء الموعد');
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function QuickActions({
  v,
  onQuick,
  onEdit,
}: {
  v: ViewingRow;
  onQuick: (v: ViewingRow, s: ViewingRow['status'], msg: string) => Promise<void>;
  onEdit: () => void;
}) {
  const active = v.status === 'requested' || v.status === 'confirmed';
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {v.status === 'requested' ? (
        <button
          type="button"
          className="link-btn"
          onClick={() => void onQuick(v, 'confirmed', 'تم تأكيد الموعد وإبلاغ العميل')}
        >
          تأكيد
        </button>
      ) : null}
      {active ? (
        <>
          <button type="button" className="link-btn" onClick={() => void onQuick(v, 'completed', 'تم')}>
            تمت
          </button>
          <button type="button" className="link-btn" onClick={() => void onQuick(v, 'no_show', 'تم')}>
            لم يحضر
          </button>
          <button
            type="button"
            className="link-btn danger"
            onClick={() => void onQuick(v, 'cancelled', 'أُلغي الموعد')}
          >
            إلغاء
          </button>
        </>
      ) : null}
      <button type="button" className="link-btn" onClick={onEdit}>
        تعديل
      </button>
    </div>
  );
}
