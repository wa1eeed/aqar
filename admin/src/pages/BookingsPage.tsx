import { bookingStatuses, paymentMethods, paymentTypes } from '@manzilah/schema';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { api, ApiError } from '../lib/api';
import { sar } from '../lib/format';
import { useRealtimeEvent } from '../lib/realtime';
import type { BookingRow, BookingStatusKey, Paged } from '../lib/types';
import { FormError } from './LoginPage';

const TABS: Array<[string, string]> = [
  ['', 'الكل'],
  ['pending_payment', 'بانتظار الدفع'],
  ['awaiting_transfer_review', 'بانتظار المراجعة'],
  ['confirmed', 'مؤكدة'],
  ['completed', 'مكتملة'],
];

/** docs/07 §6 — design/screenshots/a-bookings.png. */
export function BookingsPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paged<BookingRow> & { counts: Partial<Record<BookingStatusKey, number>> }) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) p.set('status', status);
      if (q.trim()) p.set('q', q.trim());
      setData(await api(`/admin/bookings?${p}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [status, q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useRealtimeEvent('booking.updated', () => void load());

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>الحجوزات</h1>
          <p>عربون أو دفع كامل · كل حالة حجز تغيّر حالة العقار تلقائياً</p>
        </div>
      </div>
      <div className="tools">
        <div className="seg" role="tablist" aria-label="الحالة">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={status === k}
              onClick={() => {
                setPage(1);
                setStatus(k);
              }}
            >
              {l}
              {k && data?.counts[k as BookingStatusKey] ? ` (${data.counts[k as BookingStatusKey]})` : ''}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="رقم الحجز أو اسم العميل"
          aria-label="بحث"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
      </div>
      <FormError error={error} />
      {!data ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : !data.items.length ? (
        <EmptyState icon="key" title="لا توجد حجوزات" />
      ) : (
        <section className="panel2">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الحجز</th>
                  <th>العقار</th>
                  <th>العميل</th>
                  <th>النوع</th>
                  <th>الطريقة</th>
                  <th>المستحق</th>
                  <th>المدفوع</th>
                  <th>الحالة</th>
                  <th>المهلة</th>
                  <th aria-label="فتح" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => {
                  const thumb = b.property.media?.[0]?.variants?.thumb;
                  return (
                    <tr key={b.id}>
                      <td className="t" dir="ltr" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {b.number}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {thumb ? (
                            <img className="thumb" src={thumb} alt="" />
                          ) : (
                            <span className="thumb thumb--empty" />
                          )}
                          <div>
                            <div className="t">{b.property.title}</div>
                            <div className="s">{b.property.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="nw">{b.customer.name}</td>
                      <td className="nw">{paymentTypes[b.paymentType]}</td>
                      <td className="nw">{paymentMethods[b.paymentMethod]}</td>
                      <td className="nw">{sar(b.amountDue)}</td>
                      <td className="nw">{sar(b.amountPaid)}</td>
                      <td>
                        <span className={`pill ${bookingStatuses[b.status].pill}`}>
                          {bookingStatuses[b.status].label}
                        </span>
                      </td>
                      <td className="s">
                        {b.status === 'pending_payment' ? (
                          <Countdown until={b.holdExpiresAt} />
                        ) : b.status === 'awaiting_transfer_review' ? (
                          'قيد المراجعة'
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <Link
                          className="icon-btn"
                          to={`/bookings/${b.id}`}
                          aria-label={`فتح ${b.number}`}
                          style={{ width: 36, height: 36 }}
                        >
                          <Icon name="chevL" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
    </>
  );
}
