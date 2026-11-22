import { leadSources, leadStages, leadTypes, viewingSlots, viewingStatuses, type LeadType } from '@manzilah/schema';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { ViewingModal } from '../components/ViewingModal';
import { api, ApiError } from '../lib/api';
import { date, dayLabel, phoneLabel, sar, timeAgo, timeLabel } from '../lib/format';
import type { LeadActivityRow, LeadDetail, LeadStageKey } from '../lib/types';
import { LostReasonModal } from './LeadsPage';

const ACTIVITY: Record<string, string> = { note: 'ملاحظة', call: 'مكالمة', whatsapp: 'واتساب', email: 'بريد' };

function activityText(a: LeadActivityRow, names: Map<string, string>): { title: string; body?: string } {
  const m = a.meta ?? {};
  switch (a.type) {
    case 'system':
      if (m.created === 'website') {
        const who = m.assignedToId ? names.get(String(m.assignedToId)) : null;
        return {
          title: 'تم إنشاء الطلب من الموقع',
          body: m.assignedToId ? `أُسند تلقائياً${who ? ` إلى ${who}` : ''}` : 'بانتظار الإسناد',
        };
      }
      return { title: `أُنشئ الطلب يدوياً (${leadSources[m.created as keyof typeof leadSources] ?? ''})` };
    case 'stage_change':
      return {
        title: `تغيّرت المرحلة إلى «${leadStages[m.to as LeadStageKey]?.label ?? m.to}»`,
        ...(a.body ? { body: `السبب: ${a.body}` } : {}),
      };
    case 'assignment':
      return { title: m.to ? `أُسند إلى ${names.get(String(m.to)) ?? 'مستخدم'}` : 'أُزيل المسؤول' };
    case 'viewing':
      if (m.status) {
        const label = viewingStatuses[m.status as keyof typeof viewingStatuses]?.label ?? String(m.status);
        return { title: `المعاينة: ${label}${m.by === 'customer' ? ' (بطلب العميل)' : ''}` };
      }
      return { title: `جُدولت معاينة ${m.at ? `${dayLabel(String(m.at))} · ${timeLabel(String(m.at))}` : ''}` };
    default:
      return { title: ACTIVITY[a.type] ?? a.type, ...(a.body ? { body: a.body } : {}) };
  }
}

/** Lead drawer (design/screenshots/a-lead-drawer.png, docs/07 §4). */
export function LeadDrawer({
  id,
  assignees,
  onClose,
  onChanged,
}: {
  id: string;
  assignees: Array<{ id: string; name: string }>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteType, setNoteType] = useState<'note' | 'call' | 'whatsapp' | 'email'>('note');
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async () => {
    try {
      setLead(await api<LeadDetail>(`/admin/leads/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الطلب');
    }
  }, [id]);
  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [load, onClose]);

  const act = async (fn: () => Promise<LeadDetail>, msg: string) => {
    setBusy(true);
    try {
      setLead(await fn());
      toast(msg);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const names = new Map(assignees.map((a) => [a.id, a.name]));
  if (lead?.assignedTo) names.set(lead.assignedTo.id, lead.assignedTo.name);
  const digits = lead?.phone.replace(/\D/g, '') ?? '';
  const waText = lead
    ? encodeURIComponent(
        `مرحباً ${lead.name}، معك فريق المبيعات بخصوص طلبك ${lead.number}${lead.property ? ` (${lead.property.title})` : ''}.`,
      )
    : '';

  return (
    <>
      <div className="veil" onClick={onClose} />
      <aside className="drawer2" role="dialog" aria-modal="true" aria-label="تفاصيل الطلب">
        <div className="dh">
          <div>
            <div className="s muted" dir="ltr" style={{ textAlign: 'right' }}>
              {lead?.number ?? ''}
            </div>
            <b style={{ fontSize: 20 }}>{lead?.name ?? '…'}</b>
          </div>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="db">
          {error ? <p className="field-error">{error}</p> : null}
          {!lead ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn btn--ghost btn--sm" href={`tel:${lead.phone}`}>
                  <Icon name="phone" />
                  اتصال
                </a>
                <a
                  className="btn btn--wa btn--sm"
                  href={`https://wa.me/${digits}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="whatsapp" />
                  واتساب
                </a>
                {lead.email ? (
                  <a className="btn btn--ghost btn--sm" href={`mailto:${lead.email}`}>
                    <Icon name="mail" />
                    بريد
                  </a>
                ) : null}
              </div>

              <div className="cmp">
                <div className="k">الجوال</div>
                <div dir="ltr" style={{ textAlign: 'right' }}>
                  {phoneLabel(lead.phone)}
                </div>
                <div className="k">النوع</div>
                <div>{leadTypes[lead.type as LeadType] ?? lead.type}</div>
                {lead.preferredDate ? (
                  <>
                    <div className="k">الموعد المفضل</div>
                    <div>
                      {dayLabel(lead.preferredDate)}
                      {lead.preferredSlot
                        ? ` · ${viewingSlots[lead.preferredSlot as keyof typeof viewingSlots]?.label ?? ''}`
                        : ''}
                    </div>
                  </>
                ) : null}
                <div className="k">المصدر</div>
                <div>{leadSources[lead.source as keyof typeof leadSources] ?? lead.source}</div>
                {lead.email ? (
                  <>
                    <div className="k">البريد</div>
                    <div dir="ltr" style={{ textAlign: 'right' }}>
                      {lead.email}
                    </div>
                  </>
                ) : null}
                {lead.budget ? (
                  <>
                    <div className="k">الميزانية</div>
                    <div>{sar(Number(lead.budget))}</div>
                  </>
                ) : null}
                <div className="k">تاريخ الطلب</div>
                <div>{date(lead.createdAt)}</div>
                <div className="k">حساب العميل</div>
                <div>
                  {lead.customer ? (
                    can('customers.view') ? (
                      <Link to={`/customers?open=${lead.customer.id}`}>{lead.customer.name}</Link>
                    ) : (
                      lead.customer.name
                    )
                  ) : can('leads.manage') ? (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => api<LeadDetail>(`/admin/leads/${id}/customer`, { body: {} }),
                          'تم ربط الطلب بحساب العميل',
                        )
                      }
                    >
                      ربط أو إنشاء حساب
                    </button>
                  ) : (
                    'زائر'
                  )}
                </div>
              </div>
              {lead.message ? <p style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{lead.message}</p> : null}

              <div className="form2">
                <div className="field">
                  <label htmlFor="ld-stage">المرحلة</label>
                  <select
                    id="ld-stage"
                    className="select"
                    value={lead.stage}
                    disabled={!can('leads.manage') || busy}
                    onChange={(e) => {
                      const stage = e.target.value as LeadStageKey;
                      if (stage === 'lost') setLost(true);
                      else
                        void act(
                          () => api<LeadDetail>(`/admin/leads/${id}/stage`, { body: { stage } }),
                          'تم تحديث المرحلة',
                        );
                    }}
                  >
                    {Object.entries(leadStages).map(([k, s]) => (
                      <option key={k} value={k}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ld-assignee">المسؤول</label>
                  {can('leads.assign') ? (
                    <select
                      id="ld-assignee"
                      className="select"
                      value={lead.assignedTo?.id ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        void act(
                          () =>
                            api<LeadDetail>(`/admin/leads/${id}/assign`, {
                              body: { assignedToId: e.target.value || null },
                            }),
                          'تم الإسناد',
                        )
                      }
                    >
                      <option value="">بدون مسؤول</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input id="ld-assignee" className="input" readOnly value={lead.assignedTo?.name ?? '—'} />
                  )}
                </div>
              </div>
              {lead.stage === 'lost' && lead.lostReason ? (
                <p className="muted">سبب عدم الإتمام: {lead.lostReason}</p>
              ) : null}

              {lead.property ? (
                <Link
                  to={`/properties/${lead.property.id}`}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    border: '1px solid var(--line)',
                    borderRadius: 14,
                    padding: 10,
                  }}
                >
                  {lead.property.cover ? (
                    <img
                      src={lead.property.cover}
                      alt=""
                      style={{ width: 84, height: 62, borderRadius: 10, objectFit: 'cover' }}
                    />
                  ) : (
                    <span className="thumb thumb--empty" style={{ width: 84, height: 62, borderRadius: 10 }} />
                  )}
                  <div>
                    <b style={{ fontSize: 14 }}>{lead.property.title}</b>
                    <div className="s muted">
                      {lead.property.code} · {sar(lead.property.price)}
                    </div>
                  </div>
                </Link>
              ) : null}

              {lead.viewings.length ? (
                <div>
                  <b style={{ fontSize: 14 }}>المعاينات</b>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '8px 0 0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {lead.viewings.map((v) => (
                      <li key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <span
                          className={`pill ${viewingStatuses[v.status as keyof typeof viewingStatuses]?.pill ?? 'p-gray'}`}
                        >
                          {viewingStatuses[v.status as keyof typeof viewingStatuses]?.label ?? v.status}
                        </span>
                        {dayLabel(v.scheduledAt)} · {timeLabel(v.scheduledAt)} · {v.agent.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <b style={{ fontSize: 14 }}>السجل</b>
                <div className="steps2" style={{ marginTop: 10 }}>
                  {[...lead.activities].reverse().map((a, i, all) => {
                    const t = activityText(a, names);
                    return (
                      <div className="s" key={a.id}>
                        <div className="ln">
                          <i>{i + 1}</i>
                          {i < all.length - 1 ? <span /> : null}
                        </div>
                        <div className="tx">
                          <b>{t.title}</b>
                          {t.body ? (
                            <p style={{ fontSize: 13, margin: '2px 0', whiteSpace: 'pre-wrap' }}>{t.body}</p>
                          ) : null}
                          <small>
                            {timeAgo(a.createdAt)}
                            {a.actorName ? ` · ${a.actorName}` : ''}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {can('leads.manage') ? (
                <>
                  <div className="seg" role="tablist" aria-label="نوع التسجيل" style={{ alignSelf: 'flex-start' }}>
                    {(['note', 'call', 'whatsapp', 'email'] as const).map((t) => (
                      <button key={t} type="button" aria-pressed={noteType === t} onClick={() => setNoteType(t)}>
                        {ACTIVITY[t]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="textarea"
                    placeholder={noteType === 'note' ? 'أضف ملاحظة…' : 'ملخص التواصل…'}
                    aria-label="ملاحظة"
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {lead.property && can('viewings.manage') ? (
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => setScheduling(true)}>
                        <Icon name="calendar" />
                        جدولة معاينة
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy || !note.trim()}
                      onClick={() =>
                        void act(async () => {
                          const r = await api<LeadDetail>(`/admin/leads/${id}/activities`, {
                            body: { type: noteType, body: note.trim() },
                          });
                          setNote('');
                          return r;
                        }, 'تم الحفظ')
                      }
                    >
                      حفظ الملاحظة
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </aside>
      {lost ? (
        <LostReasonModal
          onClose={() => setLost(false)}
          onSubmit={(reason) => {
            setLost(false);
            void act(
              () => api<LeadDetail>(`/admin/leads/${id}/stage`, { body: { stage: 'lost', lostReason: reason } }),
              'تم تحديث المرحلة',
            );
          }}
        />
      ) : null}
      {scheduling && lead?.property ? (
        <ViewingModal
          preset={{
            propertyId: lead.property.id,
            leadId: lead.id,
            agentId: lead.assignedTo?.id ?? null,
            date: lead.preferredDate?.slice(0, 10) ?? '',
          }}
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            toast('تمت جدولة المعاينة');
            void load();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
