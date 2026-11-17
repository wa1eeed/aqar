import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { adminPath, alertUser, notificationLook } from '../lib/notifications';
import { useRealtimeEvent } from '../lib/realtime';
import type { NotificationRow } from '../lib/types';
import { Icon } from './Icon';

/** Top-bar bell: live unread count, dropdown of the last 10, «عرض الكل» (docs/06 §2). */
export function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<{ items: NotificationRow[]; unread: number }>('/admin/notifications?pageSize=10').catch(
      () => null,
    );
    if (r) {
      setItems(r.items);
      setUnread(r.unread);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useRealtimeEvent('notification.count', (p) => setUnread(Number(p.unread) || 0));
  useRealtimeEvent('notification.new', (p) => {
    alertUser(p as unknown as NotificationRow);
    if (open) void load();
  });

  useEffect(() => {
    if (!open) return;
    void load();
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, load]);

  const go = (n: NotificationRow) => {
    setOpen(false);
    if (!n.readAt) void api('/admin/notifications/read', { body: { ids: [n.id] } }).then(load, () => undefined);
    const path = adminPath(n.link);
    navigate(path ?? '/notifications');
  };

  return (
    <div className="bell-wrap" ref={wrap}>
      <button
        type="button"
        className="icon-btn"
        aria-label={unread ? `الإشعارات، ${unread} غير مقروء` : 'الإشعارات'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" />
      </button>
      {unread ? <span className="bell-badge">{unread > 99 ? '99+' : unread}</span> : null}
      {open ? (
        <div className="bell-menu" role="dialog" aria-label="آخر الإشعارات">
          <div className="hd">
            <b>الإشعارات</b>
            {unread ? (
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  void api('/admin/notifications/read', { body: { all: true } }).then(load, () => undefined)
                }
              >
                تعليم الكل كمقروء
              </button>
            ) : null}
          </div>
          <div className="notifs" style={{ maxHeight: 420, overflow: 'auto' }}>
            {!items ? (
              <p className="muted" style={{ padding: 16 }}>
                جارٍ التحميل…
              </p>
            ) : !items.length ? (
              <p className="muted" style={{ padding: 16 }}>
                لا توجد إشعارات
              </p>
            ) : (
              items.map((n) => {
                const look = notificationLook(n.eventKey);
                return (
                  <button
                    type="button"
                    key={n.id}
                    className={`n${n.readAt ? '' : ' unread'}`}
                    style={{ width: '100%', border: 0, textAlign: 'right', font: 'inherit' }}
                    onClick={() => go(n)}
                  >
                    <span
                      className={`dot pill ${look.pill}`}
                      style={{ width: 34, height: 34, padding: 0, justifyContent: 'center' }}
                    >
                      <Icon name={look.icon} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <b>{n.title}</b>
                      <small>{timeAgo(n.createdAt)}</small>
                    </div>
                    {n.readAt ? null : <span className="u" />}
                  </button>
                );
              })
            )}
          </div>
          <Link className="ft" to="/notifications" onClick={() => setOpen(false)}>
            عرض الكل
          </Link>
        </div>
      ) : null}
    </div>
  );
}
