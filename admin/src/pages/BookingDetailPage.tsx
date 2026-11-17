import { bookingStatuses, paymentMethods, paymentStatuses, paymentTypes, statuses } from '@nx/schema';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { RefundModal } from '../components/RefundModal';
import { EmptyState } from '../components/States';
import { useToast } from '../components/Toast';
import { api, ApiError, download } from '../lib/api';
import { dayLabel, phoneLabel, sar, timeLabel } from '../lib/format';
import { useRealtimeEvent } from '../lib/realtime';
import type { BookingDetail, PaymentRow } from '../lib/types';
import { FormError } from './LoginPage';

const when = (iso: string | null) => (iso ? `${dayLabel(iso)} · ${timeLabel(iso)}` : '');

/** docs/07 §6 — design/screenshots/a-booking-detail.png. */
export function BookingDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const toast = useToast();
  const [b, setB] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refund, setRefund] = useState<PaymentRow | null>(null);
  const [cancel, setCancel] = useState(false);
  const [extend, setExtend] = useState(false);

  const load = useCallback(async () => {
    try {
      setB(await api<BookingDetail>(`/admin/bookings/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحميل');
    }
  }, [id]);
  useEffect(() => void load(), [load]);
  useRealtimeEvent('booking.updated', (p) => p.id === id && void load());
  useRealtimeEvent('payment.updated', (p) => p.bookingId === id && void load());

  const act = async (path: string, msg: string, body: unknown = {}) => {
    try {
      setB(await api<BookingDetail>(`/admin/bookings/${id}/${path}`, { body }));
      toast(msg);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذّر التنفيذ');
    }
  };

  if (error) return <EmptyState title="تعذّر تحميل الحجز">{error}</EmptyState>;
  if (!b) return <p className="muted">جارٍ التحميل…</p>;

  const paid = b.payments.find((p) => ['paid', 'partially_refunded', 'refunded'].includes(p.status));
  const open = b.status === 'pending_payment' || b.status === 'awaiting_transfer_review';
  const steps: Array<[string, string, boolean]> = [
    [
      'إنشاء الحجز',
      `العميل اختار ${paymentTypes[b.paymentType]} (${sar(b.amountDue)}) والدفع عبر ${paymentMethods[b.paymentMethod]}`,
      true,
    ],
    [
      'الدفع',
      paid
        ? `تم الدفع · ${paymentMethods[paid.method]}${paid.receiptNumber ? ` · ${paid.receiptNumber}` : ''}`
        : b.status === 'awaiting_transfer_review'
          ? 'إيصال تحويل بانتظار المراجعة'
          : b.status === 'pending_payment'
            ? 'بانتظار الدفع'
            : 'لم يكتمل',
      !!paid,
    ],
    [
      'تأكيد الحجز',
      b.confirmedAt
        ? `${when(b.confirmedAt)} · حالة العقار تغيّرت إلى «محجوز»`
        : b.status === 'cancelled' || b.status === 'expired'
          ? bookingStatuses[b.status].label
          : 'بعد اكتمال الدفع',
      !!b.confirmedAt,
    ],
    ['إتمام الصفقة', b.completedAt ? when(b.completedAt) : 'بانتظار الإفراغ وتوقيع العقد', !!b.completedAt],
  ];
  const photo = b.property.media[0]?.variants?.card ?? b.property.media[0]?.variants?.thumb;

  return (
    <>
      <div className="adm-head">
        <div>
          <div className="crumb muted" style={{ fontSize: 13 }}>
            <Link to="/bookings">الحجوزات</Link> / التفاصيل
          </div>
          <h1 dir="auto">الحجز {b.number}</h1>
          <p>
            أنشئ في {when(b.createdAt)} ·{' '}
            <span className={`pill ${bookingStatuses[b.status].pill}`}>{bookingStatuses[b.status].label}</span>
            {b.status === 'pending_payment' ? (
              <>
                {' '}
                · المهلة <Countdown until={b.holdExpiresAt} />
              </>
            ) : null}
          </p>
        </div>
        {can('bookings.manage') ? (
          <div className="acts">
            {open ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExtend(true)}>
                <Icon name="clock" />
                تمديد المهلة
              </button>
            ) : null}
            {open || b.status === 'confirmed' ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCancel(true)}>
                <Icon name="close" />
                إلغاء الحجز
              </button>
            ) : null}
            {open && b.amountPaid >= b.amountDue ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void act('confirm', 'تم تأكيد الحجز')}
              >
                <Icon name="check" />
                تأكيد الحجز
              </button>
            ) : null}
            {b.status === 'confirmed' ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() =>
                  window.confirm('إتمام الصفقة؟ ستتغير حالة العقار إلى «مباع» أو «مؤجر».') &&
                  void act('complete', 'تم إتمام الصفقة')
                }
              >
                <Icon name="check" />
                إتمام الصفقة
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="g2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="panel2">
            <div className="ph">
              <h3>مراحل الحجز</h3>
            </div>
            <div className="pb">
              <div className="steps2">
                {steps.map(([t, d, done], i) => (
                  <div className="s" key={t}>
                    <div className="ln">
                      <i className={done ? '' : 'o'}>{done ? '✓' : i + 1}</i>
                      {i < steps.length - 1 ? <span /> : null}
                    </div>
                    <div className="tx">
                      <b>{t}</b>
                      <small>{d}</small>
                    </div>
                  </div>
                ))}
              </div>
              {b.cancelReason ? <p className="muted">سبب الإلغاء: {b.cancelReason}</p> : null}
              {b.customerNotes ? <p className="muted">ملاحظات العميل: {b.customerNotes}</p> : null}
            </div>
          </section>
          <section className="panel2">
            <div className="ph">
              <h3>المدفوعات</h3>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>الإيصال</th>
                    <th>الطريقة</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th aria-label="إجراءات" />
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td dir="ltr" style={{ textAlign: 'right' }}>
                        {p.receiptNumber ?? '—'}
                      </td>
                      <td>{paymentMethods[p.method]}</td>
                      <td>
                        {sar(p.amount)}
                        {p.refundedAmount ? <div className="s">مسترد {sar(p.refundedAmount)}</div> : null}
                      </td>
                      <td>
                        <span className={`pill ${paymentStatuses[p.status]?.pill ?? 'p-gray'}`}>
                          {paymentStatuses[p.status]?.label ?? p.status}
                        </span>
                      </td>
                      <td className="s">{when(p.paidAt ?? p.createdAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {p.receiptNumber ? (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() =>
                              void download(`/admin/payments/${p.id}/receipt.pdf`, `${p.receiptNumber}.pdf`).catch(
                                (e) => toast(e instanceof ApiError ? e.message : 'تعذّر التنزيل'),
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
                        {(p.status === 'paid' || p.status === 'partially_refunded') && can('payments.refund') ? (
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRefund(p)}>
                            استرداد
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="panel2">
            <div className="ph">
              <h3>العقار</h3>
            </div>
            <div className="pb">
              {photo ? (
                <img src={photo} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 12 }} />
              ) : null}
              <Link to={`/properties/${b.property.id}`}>
                <b style={{ display: 'block', marginTop: 10 }}>{b.property.title}</b>
              </Link>
              <div className="s muted">
                {b.property.code} · {b.property.district.nameAr} · المستشار: {b.property.agent.name}
              </div>
              <div style={{ marginTop: 8 }}>
                <span className="pill p-amber">
                  <i />
                  {statuses[b.property.status as keyof typeof statuses]?.label ?? b.property.status}
                </span>
              </div>
            </div>
          </section>
          <section className="panel2">
            <div className="ph">
              <h3>العميل</h3>
            </div>
            <div className="pb">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="avatar" style={{ width: 44, height: 44 }}>
                  {b.customer.name.slice(0, 1)}
                </span>
                <div>
                  <b>
                    {can('customers.view') ? (
                      <Link to={`/customers?open=${b.customer.id}`}>{b.customer.name}</Link>
                    ) : (
                      b.customer.name
                    )}
                  </b>
                  <div className="s muted" dir="ltr" style={{ textAlign: 'right' }}>
                    {phoneLabel(b.customer.phone)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                {b.customer.emailVerifiedAt ? <span className="pill p-green">✓ البريد موثّق</span> : null}
                {b.customer.nafathVerifiedAt ? <span className="pill p-green">✓ نفاذ</span> : null}
              </div>
            </div>
          </section>
          <section className="panel2">
            <div className="ph">
              <h3>الملخص المالي</h3>
            </div>
            <div className="pb">
              <div className="cmp">
                <div className="k">سعر العقار</div>
                <div>{sar(b.priceSnapshot)}</div>
                <div className="k">نوع الدفع</div>
                <div>{paymentTypes[b.paymentType]}</div>
                <div className="k">المستحق</div>
                <div>{sar(b.amountDue)}</div>
                <div className="k">المدفوع</div>
                <div className="up" style={{ fontWeight: 800 }}>
                  {sar(b.amountPaid)}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

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
      {cancel ? (
        <ReasonModal
          title="إلغاء الحجز"
          label="سبب الإلغاء"
          submit="إلغاء الحجز"
          hint={
            b.status === 'confirmed'
              ? 'سيعود العقار «متاحاً». إن كان هناك مبلغ مدفوع فنفّذ الاسترداد من جدول المدفوعات.'
              : undefined
          }
          onClose={() => setCancel(false)}
          onSubmit={async (reason) => {
            setCancel(false);
            await act('cancel', 'تم إلغاء الحجز', { reason });
          }}
        />
      ) : null}
      {extend ? (
        <Modal title="تمديد مهلة الحجز" onClose={() => setExtend(false)}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {[6, 12, 24, 48, 72].map((h) => (
              <button
                key={h}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setExtend(false);
                  void act('extend-hold', `تم تمديد المهلة ${h} ساعة`, { hours: h });
                }}
              >
                + {h} ساعة
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function ReasonModal({
  title,
  label,
  submit,
  hint,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  submit: string;
  hint?: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length < 2) return setError('السبب مطلوب');
          void onSubmit(reason.trim());
        }}
      >
        <FormError error={error} />
        {hint ? <p className="muted">{hint}</p> : null}
        <div className="field">
          <label htmlFor="rs-reason">{label} *</label>
          <textarea
            id="rs-reason"
            className="textarea"
            required
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            تراجع
          </button>
          <button type="submit" className="btn btn--primary btn--sm">
            {submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
