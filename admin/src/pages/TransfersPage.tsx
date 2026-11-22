import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { date, sar, timeAgo } from '../lib/format';
import { useRealtimeEvent } from '../lib/realtime';
import type { PaymentRow } from '../lib/types';
import { FormError } from './LoginPage';

type QueueRow = PaymentRow & { booking: { id: string; number: string; customer: { name: string } } };
type Detail = PaymentRow & {
  booking: {
    id: string;
    number: string;
    amountDue: number;
    customer: { name: string };
    property: { title: string; code: string };
  };
};

/** docs/04 §6 review queue — design/screenshots/a-transfers.png. */
export function TransfersPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; type: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const openId = params.get('open') ?? queue?.[0]?.id ?? null;

  const loadQueue = useCallback(async () => {
    try {
      setQueue((await api<{ items: QueueRow[] }>('/admin/payments?status=under_review&pageSize=50')).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, []);
  useEffect(() => void loadQueue(), [loadQueue]);
  useRealtimeEvent('payment.updated', () => void loadQueue());

  useEffect(() => {
    if (!openId) return;
    let url: string | null = null;
    setD(null);
    setReceipt(null);
    setReason('');
    void (async () => {
      try {
        const detail = await api<Detail>(`/admin/payments/${openId}`);
        setD(detail);
        if (detail.transfer?.hasReceipt) {
          const blob = await api<Blob>(`/admin/payments/${openId}/transfer/receipt`, { blob: true });
          url = URL.createObjectURL(blob);
          setReceipt({ url, type: blob.type });
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الإيصال');
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [openId]);

  const decide = async (action: 'approve' | 'reject') => {
    if (!d) return;
    if (action === 'reject' && reason.trim().length < 2) {
      setError('سبب الرفض مطلوب');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/${d.id}/transfer/${action}`, {
        body: action === 'reject' ? { reason: reason.trim() } : {},
      });
      toast(action === 'approve' ? 'تم اعتماد التحويل وتأكيد الحجز' : 'تم رفض الإيصال وإبلاغ العميل');
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
      await loadQueue();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التنفيذ');
    } finally {
      setBusy(false);
    }
  };

  const t = d?.transfer;
  const amountOk = t?.amount !== undefined && d ? Number(t.amount) === Number(d.amount) : false;
  const refOk = !!t?.transferReference && !!d && t.transferReference.toUpperCase().includes(d.booking.number);
  const isPdf = receipt?.type === 'application/pdf';

  return (
    <>
      <div className="adm-head">
        <div>
          <div className="crumb muted" style={{ fontSize: 13 }}>
            <Link to="/payments">المدفوعات</Link> / التحويلات
          </div>
          <h1>مراجعة التحويلات البنكية</h1>
          <p>{queue ? `${queue.length} إيصالات بانتظار المراجعة` : ' '}</p>
        </div>
      </div>
      <FormError error={error} />
      {queue && !queue.length && !d ? (
        <EmptyState icon="check" title="لا توجد إيصالات بانتظار المراجعة" />
      ) : (
        <>
          {queue && queue.length > 1 ? (
            <div className="tools">
              {queue.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={`chip${q.id === openId ? ' is-on' : ''}`}
                  aria-pressed={q.id === openId}
                  onClick={() => setParams({ open: q.id })}
                >
                  {q.booking.number} · {q.booking.customer.name}
                </button>
              ))}
            </div>
          ) : null}
          {!d ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : (
            <div className="g2">
              <section className="panel2">
                <div className="ph">
                  <h3>إيصال الحجز {d.booking.number}</h3>
                  <span
                    className={`pill ${t?.status === 'submitted' ? 'p-amber' : t?.status === 'approved' ? 'p-green' : 'p-red'}`}
                  >
                    {t?.status === 'submitted'
                      ? `قيد المراجعة · ${timeAgo(t.createdAt)}`
                      : t?.status === 'approved'
                        ? 'معتمد'
                        : 'مرفوض'}
                  </span>
                </div>
                <div className="pb">
                  <div className="receipt" style={zoom ? { height: 'auto', minHeight: 420 } : undefined}>
                    {!receipt ? (
                      <span className="muted">{t?.hasReceipt ? 'جارٍ تحميل الإيصال…' : 'لم يُرفق إيصال'}</span>
                    ) : isPdf ? (
                      <div style={{ textAlign: 'center' }}>
                        <Icon name="doc" />
                        <p>الإيصال بصيغة PDF</p>
                        <a
                          className="btn btn--primary btn--sm"
                          href={receipt.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          فتح الإيصال
                        </a>
                      </div>
                    ) : (
                      <img
                        src={receipt.url}
                        alt="إيصال التحويل"
                        style={{ maxWidth: '100%', maxHeight: zoom ? 'none' : 400, objectFit: 'contain' }}
                      />
                    )}
                  </div>
                  {receipt ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      {!isPdf ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setZoom((z) => !z)}>
                          <Icon name="expand" />
                          {zoom ? 'تصغير' : 'تكبير'}
                        </button>
                      ) : null}
                      <a className="btn btn--ghost btn--sm" href={receipt.url} download={`receipt-${d.booking.number}`}>
                        <Icon name="doc" />
                        تنزيل
                      </a>
                    </div>
                  ) : null}
                </div>
              </section>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <section className="panel2">
                  <div className="ph">
                    <h3>المقارنة</h3>
                  </div>
                  <div className="pb">
                    <div className="cmp">
                      <div className="k">المبلغ المستحق</div>
                      <div style={{ fontWeight: 800 }}>{sar(d.amount)}</div>
                      <div className="k">المبلغ المحوّل</div>
                      <div
                        className={amountOk ? 'up' : ''}
                        style={{ fontWeight: 800, color: amountOk ? undefined : 'var(--st-sold)' }}
                      >
                        {sar(t?.amount ?? 0)} {amountOk ? '✓' : '✕'}
                      </div>
                      <div className="k">الحساب</div>
                      <div>
                        {t?.bankAccount?.bankName} · …{t?.bankAccount?.iban.slice(-4)}
                      </div>
                      <div className="k">اسم المحوّل</div>
                      <div>{t?.senderName}</div>
                      <div className="k">بنك المحوّل</div>
                      <div>{t?.senderBank}</div>
                      <div className="k">المرجع</div>
                      <div dir="ltr" style={{ textAlign: 'right' }}>
                        {t?.transferReference || '—'} {t?.transferReference ? (refOk ? '✓' : '') : ''}
                      </div>
                      <div className="k">تاريخ التحويل</div>
                      <div>{date(t?.transferredAt)}</div>
                      <div className="k">العميل</div>
                      <div>
                        <Link to={`/bookings/${d.booking.id}`}>{d.booking.customer.name}</Link>
                      </div>
                    </div>
                  </div>
                </section>
                {t?.status === 'submitted' ? (
                  <section className="panel2">
                    <div className="ph">
                      <h3>القرار</h3>
                    </div>
                    <div className="pb">
                      <button
                        type="button"
                        className="btn btn--primary btn--block"
                        disabled={busy}
                        onClick={() => void decide('approve')}
                      >
                        <Icon name="check" />
                        اعتماد التحويل وتأكيد الحجز
                      </button>
                      <div className="field" style={{ marginTop: 12 }}>
                        <label htmlFor="rj">سبب الرفض (مطلوب عند الرفض)</label>
                        <textarea
                          id="rj"
                          className="textarea"
                          style={{ minHeight: 80 }}
                          placeholder="مثال: المبلغ غير مطابق"
                          maxLength={300}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--block"
                        style={{ marginTop: 10, color: 'var(--st-sold)' }}
                        disabled={busy}
                        onClick={() => void decide('reject')}
                      >
                        رفض الإيصال
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
