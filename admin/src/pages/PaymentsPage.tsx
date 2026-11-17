import { paymentMethods, paymentStatuses } from '@nx/schema';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { RefundModal } from '../components/RefundModal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, download } from '../lib/api';
import { date, sar } from '../lib/format';
import { useRealtimeEvent } from '../lib/realtime';
import type { Paged, PaymentRow } from '../lib/types';
import { FormError } from './LoginPage';

type Row = PaymentRow & {
  booking: { id: string; number: string; customer: { name: string }; property: { title: string } };
};
type Data = Paged<Row> & { month: Array<{ method: string; paid: number; refunded: number }>; underReview: number };

/** docs/07 §6 — design/screenshots/a-payments.png. */
export function PaymentsPage() {
  const { can } = useSession();
  const toast = useToast();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refund, setRefund] = useState<PaymentRow | null>(null);
  const highlight = params.get('open');

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) p.set('status', status);
      if (method) p.set('method', method);
      if (q.trim()) p.set('q', q.trim());
      setData(await api<Data>(`/admin/payments?${p}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [status, method, q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useRealtimeEvent('payment.updated', () => void load());

  const total = (m?: string) =>
    (data?.month ?? []).filter((x) => !m || x.method === m).reduce((n, x) => n + Number(x.paid), 0);
  const refunded = (data?.month ?? []).reduce((n, x) => n + Number(x.refunded), 0);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>المدفوعات</h1>
          <p>{data ? `مدفوعات هذا الشهر: ${sar(total())}` : ' '}</p>
        </div>
        <div className="acts">
          {can('payments.review') ? (
            <Link className="btn btn--primary btn--sm" to="/payments/transfers">
              تحويلات بانتظار المراجعة{' '}
              {data?.underReview ? (
                <b style={{ background: 'var(--gold)', color: 'var(--green-900)', borderRadius: 8, padding: '0 6px' }}>
                  {data.underReview}
                </b>
              ) : null}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="kpis2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {(
          [
            ['المدفوع هذا الشهر', total()],
            ['عبر ميسر', total('moyasar')],
            ['تحويلات بنكية', total('bank_transfer')],
            ['المسترد', refunded],
          ] as const
        ).map(([l, v]) => (
          <div className="kpi2" key={l}>
            <span>{l}</span>
            <b style={{ fontSize: 22 }}>{sar(v)}</b>
          </div>
        ))}
      </div>
      <div className="tools">
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="رقم الإيصال أو الحجز أو العميل"
          aria-label="بحث"
          value={q}
          onChange={(e) => (setPage(1), setQ(e.target.value))}
        />
        <select
          className="select"
          aria-label="الحالة"
          value={status}
          onChange={(e) => (setPage(1), setStatus(e.target.value))}
        >
          <option value="">كل الحالات</option>
          {Object.entries(paymentStatuses).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="الطريقة"
          value={method}
          onChange={(e) => (setPage(1), setMethod(e.target.value))}
        >
          <option value="">كل الطرق</option>
          {Object.entries(paymentMethods).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <FormError error={error} />
      {!data ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : !data.items.length ? (
        <EmptyState icon="calc" title="لا توجد مدفوعات" />
      ) : (
        <section className="panel2">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الإيصال</th>
                  <th>الحجز</th>
                  <th>العميل</th>
                  <th>الطريقة</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th aria-label="إجراءات" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} style={p.id === highlight ? { background: '#fbf7ee' } : undefined}>
                    <td dir="ltr" style={{ textAlign: 'right' }}>
                      {p.receiptNumber ?? '—'}
                    </td>
                    <td dir="ltr" style={{ textAlign: 'right' }}>
                      <Link to={`/bookings/${p.booking.id}`}>{p.booking.number}</Link>
                    </td>
                    <td>{p.booking.customer.name}</td>
                    <td>{paymentMethods[p.method]}</td>
                    <td className="t">
                      {sar(p.amount)}
                      {p.refundedAmount ? <div className="s">مسترد {sar(p.refundedAmount)}</div> : null}
                    </td>
                    <td>
                      <span className={`pill ${paymentStatuses[p.status]?.pill ?? 'p-gray'}`}>
                        {paymentStatuses[p.status]?.label ?? p.status}
                      </span>
                      {p.failureReason === 'AMOUNT_MISMATCH' ? (
                        <div className="s" style={{ color: 'var(--st-sold)' }}>
                          مبلغ غير مطابق
                        </div>
                      ) : null}
                    </td>
                    <td className="s">{date(p.paidAt ?? p.createdAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {p.receiptNumber ? (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() =>
                            void download(`/admin/payments/${p.id}/receipt.pdf`, `${p.receiptNumber}.pdf`).catch((e) =>
                              toast(e instanceof ApiError ? e.message : 'تعذّر التنزيل'),
                            )
                          }
                        >
                          الإيصال
                        </button>
                      ) : null}{' '}
                      {p.status === 'under_review' && can('payments.review') ? (
                        <Link className="link-btn" to={`/payments/transfers?open=${p.id}`}>
                          مراجعة
                        </Link>
                      ) : null}
                      {p.method === 'moyasar' && (p.status === 'pending' || p.status === 'initiated') ? (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={async () => {
                            const r = await api<{ status: string }>(`/admin/payments/${p.id}/reconcile`, {
                              body: {},
                            }).catch(() => null);
                            toast(
                              r ? `الحالة لدى ميسر: ${paymentStatuses[r.status]?.label ?? r.status}` : 'تعذّر التحقق',
                            );
                            void load();
                          }}
                        >
                          إعادة التحقق
                        </button>
                      ) : null}
                      {(p.status === 'paid' || p.status === 'partially_refunded') && can('payments.refund') ? (
                        <button type="button" className="link-btn" onClick={() => setRefund(p)}>
                          استرداد
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
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
      {refund ? (
        <RefundModal
          payment={refund}
          onClose={() => setRefund(null)}
          onDone={() => {
            setRefund(null);
            toast('تم تنفيذ الاسترداد');
            void load();
          }}
        />
      ) : null}
    </>
  );
}
