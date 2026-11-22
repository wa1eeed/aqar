import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { sar } from '../lib/format';
import type { PaymentRow } from '../lib/types';
import { FormError } from '../pages/LoginPage';
import { Modal } from './Modal';

/** Full or partial refund (docs/07 §6): amount ≤ refundable, reason required, re-auth by the API. */
export function RefundModal({
  payment,
  onClose,
  onDone,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const refundable = payment.amount - payment.refundedAmount;
  const [amount, setAmount] = useState(String(refundable / 100));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="استرداد مبلغ" onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const halalas = Math.round(Number(amount.replace(/,/g, '')) * 100);
          if (!Number.isFinite(halalas) || halalas <= 0 || halalas > refundable) {
            setError(`أدخل مبلغاً بين 0.01 و ${sar(refundable)}`);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await api(`/admin/payments/${payment.id}/refund`, { body: { amount: halalas, reason: reason.trim() } });
            onDone();
          } catch (e2) {
            setError(e2 instanceof ApiError ? e2.message : 'تعذّر الاسترداد');
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError error={error} />
        <p className="muted">
          المتاح للاسترداد: <b>{sar(refundable)}</b>
          {payment.method === 'bank_transfer'
            ? ' — حوّل المبلغ للعميل من حساب المنشأة ثم سجّل الاسترداد هنا.'
            : ' — يُعاد المبلغ إلى وسيلة الدفع عبر ميسر.'}
        </p>
        <div className="field">
          <label htmlFor="rf-amount">المبلغ (ر.س)</label>
          <input
            id="rf-amount"
            className="input"
            dir="ltr"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rf-reason">السبب *</label>
          <input
            id="rf-reason"
            className="input"
            required
            minLength={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            تنفيذ الاسترداد
          </button>
        </div>
      </form>
    </Modal>
  );
}
