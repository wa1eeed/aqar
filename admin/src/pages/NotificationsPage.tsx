import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../app/session';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { timeAgo } from '../lib/format';
import { adminPath, alertPrefs, notificationLook, setAlertPrefs, STAFF_EVENT_LABELS } from '../lib/notifications';
import { useRealtimeEvent } from '../lib/realtime';
import type { NotificationRow, Paged } from '../lib/types';
import { FormError } from './LoginPage';

const TABS: Array<[string, string]> = [
  ['', 'الكل'],
  ['unread', 'غير مقروء'],
  ['leads', 'الطلبات'],
  ['bookings', 'الحجوزات'],
  ['payments', 'المدفوعات'],
  ['system', 'النظام'],
];
const ROLES: Array<[string, string]> = [
  ['owner', 'مالك المنشأة'],
  ['admin', 'مدير النظام'],
  ['sales_manager', 'مدير المبيعات'],
  ['agent', 'مستشار عقاري'],
  ['finance', 'المالية'],
  ['content_editor', 'محرر المحتوى'],
];

/** docs/06 §2 admin notification center + docs/07 §8 broadcast. */
export function NotificationsPage() {
  const { can } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paged<NotificationRow> & { unread: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [prefs, setPrefs] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (tab === 'unread') q.set('unread', '1');
      else if (tab) q.set('tab', tab);
      setData(await api(`/admin/notifications?${q}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [tab, page]);
  useEffect(() => void load(), [load]);
  useRealtimeEvent('notification.new', () => void load());

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    await api('/admin/notifications/read', { body }).catch(() => undefined);
    void load();
  };
  const archive = async (id: string) => {
    await api('/admin/notifications/archive', { body: { ids: [id] } }).catch(() => undefined);
    toast('أُرشف الإشعار');
    void load();
  };
  const openItem = (n: NotificationRow) => {
    if (!n.readAt) void markRead({ ids: [n.id] });
    const path = adminPath(n.link);
    if (path) navigate(path);
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الإشعارات</h1>
          <p>إشعارات لحظية عبر WebSocket وبريد عبر Resend</p>
        </div>
        <div className="acts">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPrefs(true)}>
            <Icon name="sparkle" />
            تفضيلات الإشعارات
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!data?.unread}
            onClick={() => void markRead({ all: true })}
          >
            <Icon name="check" />
            تعليم الكل كمقروء
          </button>
          {can('notifications.broadcast') ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setBroadcast(true)}>
              <Icon name="plus" />
              إرسال تنبيه للفريق
            </button>
          ) : null}
        </div>
      </div>
      <FormError error={error} />
      <section className="panel2">
        <nav className="tabs2" aria-label="تصنيف الإشعارات">
          {TABS.map(([k, l]) => (
            <a
              key={k}
              href={`#${k || 'all'}`}
              className={tab === k ? 'on' : ''}
              aria-current={tab === k ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                setPage(1);
                setTab(k);
              }}
            >
              {k === 'unread' && data ? `${l} (${data.unread})` : l}
            </a>
          ))}
        </nav>
        {!data ? (
          <p className="muted" style={{ padding: 18 }}>
            جارٍ التحميل…
          </p>
        ) : !data.items.length ? (
          <EmptyState icon="bell" title="لا توجد إشعارات" />
        ) : (
          <div className="notifs">
            {data.items.map((n) => {
              const look = notificationLook(n.eventKey);
              return (
                <div
                  key={n.id}
                  className={`n${n.readAt ? '' : ' unread'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openItem(n)}
                  onKeyDown={(e) => e.key === 'Enter' && openItem(n)}
                >
                  <span
                    className={`dot pill ${look.pill}`}
                    style={{ width: 40, height: 40, padding: 0, justifyContent: 'center' }}
                  >
                    <Icon name={look.icon} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <b>{n.title}</b>
                    {n.body ? <p>{n.body}</p> : null}
                    <small>{timeAgo(n.createdAt)}</small>
                    <div className="acts" onClick={(e) => e.stopPropagation()}>
                      {!n.readAt ? (
                        <button type="button" className="link-btn" onClick={() => void markRead({ ids: [n.id] })}>
                          تعليم كمقروء
                        </button>
                      ) : null}
                      <button type="button" className="link-btn" onClick={() => void archive(n.id)}>
                        أرشفة
                      </button>
                    </div>
                  </div>
                  {n.readAt ? null : <span className="u" aria-label="غير مقروء" />}
                </div>
              );
            })}
          </div>
        )}
        {data && data.pages > 1 ? (
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
      {broadcast ? (
        <BroadcastModal
          onClose={() => setBroadcast(false)}
          onDone={(n) => {
            setBroadcast(false);
            toast(`أُرسل التنبيه إلى ${n} من الفريق`);
          }}
        />
      ) : null}
      {prefs ? <PrefsModal onClose={() => setPrefs(false)} /> : null}
    </>
  );
}

function BroadcastModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [roles, setRoles] = useState<string[]>(['agent']);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="إرسال تنبيه للفريق" onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!roles.length) return setError('اختر دوراً واحداً على الأقل');
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ recipients: number }>('/admin/notifications/broadcast', {
              body: { roles, title: title.trim(), body: body.trim() },
            });
            onDone(r.recipients);
          } catch (e2) {
            setError(e2 instanceof ApiError ? e2.message : 'تعذّر الإرسال');
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError error={error} />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>إلى</legend>
          <div className="chips">
            {ROLES.map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={`chip${roles.includes(k) ? ' is-on' : ''}`}
                aria-pressed={roles.includes(k)}
                onClick={() => setRoles((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="bc-title">العنوان *</label>
          <input
            id="bc-title"
            className="input"
            required
            minLength={2}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="bc-body">النص</label>
          <textarea
            id="bc-body"
            className="textarea"
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            إرسال
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Pref = { eventKey: string; inApp: boolean; email: boolean; sms: boolean; locked: boolean };

function PrefsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Pref[] | null>(null);
  const [alerts, setAlerts] = useState(alertPrefs);
  useEffect(() => {
    void api<{ items: Pref[] }>('/admin/notification-preferences').then((r) => setItems(r.items));
  }, []);
  const toggle = (k: string, ch: 'inApp' | 'email') =>
    setItems((xs) => xs?.map((x) => (x.eventKey === k ? { ...x, [ch]: !x[ch] } : x)) ?? null);

  return (
    <Modal title="تفضيلات الإشعارات" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label className="check">
            <input
              type="checkbox"
              checked={alerts.desktop}
              onChange={async (e) => {
                let on = e.target.checked;
                if (on && 'Notification' in window && Notification.permission !== 'granted') {
                  on = (await Notification.requestPermission()) === 'granted';
                }
                const v = { ...alerts, desktop: on };
                setAlerts(v);
                setAlertPrefs(v);
              }}
            />
            إشعارات سطح المكتب عندما تكون اللوحة في الخلفية
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={alerts.sound}
              onChange={(e) => {
                const v = { ...alerts, sound: e.target.checked };
                setAlerts(v);
                setAlertPrefs(v);
              }}
            />
            تنبيه صوتي للإشعارات العاجلة
          </label>
        </div>
        {!items ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : (
          <table className="tbl prefs-tbl">
            <thead>
              <tr>
                <th>الحدث</th>
                <th>داخل اللوحة</th>
                <th>البريد</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.eventKey}>
                  <td>
                    {STAFF_EVENT_LABELS[p.eventKey] ?? p.eventKey}
                    {p.locked ? <div className="s">إشعار أساسي لا يمكن إيقافه</div> : null}
                  </td>
                  {(['inApp', 'email'] as const).map((ch) => (
                    <td key={ch}>
                      <input
                        type="checkbox"
                        aria-label={`${STAFF_EVENT_LABELS[p.eventKey] ?? p.eventKey} — ${ch === 'inApp' ? 'داخل اللوحة' : 'البريد'}`}
                        checked={p[ch]}
                        disabled={p.locked}
                        onChange={() => toggle(p.eventKey, ch)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إغلاق
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!items}
            onClick={async () => {
              try {
                await api('/admin/notification-preferences', {
                  method: 'PUT',
                  body: { items: items!.map(({ eventKey, inApp, email, sms }) => ({ eventKey, inApp, email, sms })) },
                });
                toast('تم حفظ التفضيلات');
                onClose();
              } catch (e) {
                toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ');
              }
            }}
          >
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}
