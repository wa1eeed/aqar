import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { ViewingRow } from '../lib/types';
import { FormError } from '../pages/LoginPage';
import { Modal } from './Modal';

const TIMES = Array.from({ length: 27 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`;
});

/** Riyadh is UTC+3 all year. */
const riyadhParts = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};

/** Create or edit a viewing (docs/07 §5). Times are entered in Riyadh time. */
export function ViewingModal({
  viewing,
  preset,
  onClose,
  onDone,
}: {
  viewing?: ViewingRow;
  preset?: { propertyId?: number; leadId?: string; agentId?: string | null; date?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const start = viewing ? riyadhParts(viewing.scheduledAt) : { date: preset?.date ?? '', time: '16:00' };
  const [form, setForm] = useState({
    propertyId: String(viewing?.property.id ?? preset?.propertyId ?? ''),
    date: start.date,
    time: start.time,
    durationMin: String(viewing?.durationMin ?? 45),
    agentId: viewing?.agent.id ?? preset?.agentId ?? '',
    status: viewing?.status ?? 'confirmed',
    notes: viewing?.notes ?? '',
  });
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    void api<{ items: Array<{ id: string; name: string }> }>('/admin/assignees?for=viewings')
      .then((r) => setAgents(r.items))
      .catch(() => undefined);
  }, []);

  return (
    <Modal title={viewing ? 'تعديل الموعد' : 'موعد معاينة جديد'} onClose={onClose}>
      <form
        className="form2"
        style={{ marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const scheduledAt = new Date(`${form.date}T${form.time}:00+03:00`).toISOString();
            const common = {
              scheduledAt,
              durationMin: Number(form.durationMin),
              notes: form.notes.trim(),
              ...(form.agentId ? { agentId: form.agentId } : {}),
            };
            if (viewing) {
              await api(`/admin/viewings/${viewing.id}`, { method: 'PATCH', body: { ...common, status: form.status } });
            } else {
              await api('/admin/viewings', {
                body: {
                  ...common,
                  propertyId: Number(form.propertyId.replace(/\D/g, '')),
                  status: form.status === 'requested' ? 'requested' : 'confirmed',
                  ...(preset?.leadId ? { leadId: preset.leadId } : {}),
                },
              });
            }
            onDone();
          } catch (e2) {
            setError(e2 instanceof ApiError ? e2.message : 'تعذّر الحفظ');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="full">
          <FormError error={error} />
          {viewing ? (
            <p className="muted">
              {viewing.property.title} · {viewing.customer?.name ?? viewing.lead?.name ?? 'بدون عميل'}
            </p>
          ) : null}
        </div>
        {!viewing && !preset?.propertyId ? (
          <div className="field full">
            <label htmlFor="vm-prop">رقم العقار *</label>
            <input
              id="vm-prop"
              className="input"
              dir="ltr"
              required
              inputMode="numeric"
              placeholder="1001"
              value={form.propertyId}
              onChange={(e) => set('propertyId', e.target.value)}
            />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="vm-date">التاريخ *</label>
          <input
            id="vm-date"
            className="input"
            type="date"
            required
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vm-time">الوقت *</label>
          <select id="vm-time" className="select" value={form.time} onChange={(e) => set('time', e.target.value)}>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vm-dur">المدة</label>
          <select
            id="vm-dur"
            className="select"
            value={form.durationMin}
            onChange={(e) => set('durationMin', e.target.value)}
          >
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} دقيقة
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vm-status">الحالة</label>
          <select id="vm-status" className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="confirmed">مؤكد (يُرسل تأكيد للعميل)</option>
            <option value="requested">مطلوب</option>
            {viewing ? (
              <>
                <option value="completed">تمت</option>
                <option value="no_show">لم يحضر</option>
                <option value="cancelled">ملغي</option>
              </>
            ) : null}
          </select>
        </div>
        {agents.length > 1 ? (
          <div className="field full">
            <label htmlFor="vm-agent">المستشار</label>
            <select
              id="vm-agent"
              className="select"
              value={form.agentId}
              onChange={(e) => set('agentId', e.target.value)}
            >
              <option value="">مستشار العقار</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field full">
          <label htmlFor="vm-notes">ملاحظات</label>
          <textarea
            id="vm-notes"
            className="textarea"
            maxLength={1000}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
        <div className="full" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            حفظ الموعد
          </button>
        </div>
      </form>
    </Modal>
  );
}
