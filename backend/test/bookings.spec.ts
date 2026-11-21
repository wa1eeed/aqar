import { describe, it, expect } from 'vitest';
import { computeQuote, type Policy } from '../src/modules/bookings/quote.js';
import { isValidSaudiIban, formatIban } from '../src/modules/bookings/iban.js';

const policy = (over: Partial<Policy['deposit']> = {}): Policy => ({
  paymentTypes: ['deposit', 'full'],
  defaultPaymentType: 'deposit',
  deposit: { mode: 'percent', fixedAmount: 0, percent: 10, min: null, max: null, ...over },
  methods: { deposit: ['moyasar'], full: ['bank_transfer'] },
});

describe('computeQuote', () => {
  it('نسبة مئوية', () => {
    const q = computeQuote(policy(), 1_000_000, 'deposit');
    expect(q.depositAmount).toBe(100_000);
    expect(q.amountDue).toBe(100_000);
    expect(computeQuote(policy(), 1_000_000, 'full').amountDue).toBe(1_000_000);
  });
  it('مبلغ ثابت', () => {
    const q = computeQuote(policy({ mode: 'fixed', fixedAmount: 50_000 }), 1_000_000, 'deposit');
    expect(q.depositAmount).toBe(50_000);
  });
  it('حدّ أدنى/أعلى وعدم تجاوز الكامل', () => {
    expect(computeQuote(policy({ percent: 10, min: 200_000 }), 1_000_000, 'deposit').depositAmount).toBe(200_000);
    expect(computeQuote(policy({ percent: 50, max: 300_000 }), 1_000_000, 'deposit').depositAmount).toBe(300_000);
    expect(computeQuote(policy({ mode: 'fixed', fixedAmount: 9_000_000 }), 1_000_000, 'deposit').depositAmount).toBe(1_000_000);
  });
});

describe('isValidSaudiIban', () => {
  it('يقبل IBAN صالحاً ويرفض غيره', () => {
    expect(isValidSaudiIban('SA03 8000 0000 6080 1016 7519')).toBe(true);
    expect(isValidSaudiIban('SA0380000000608010167519')).toBe(true);
    expect(isValidSaudiIban('SA0280000000608010167519')).toBe(false); // أرقام تحقّق خاطئة
    expect(isValidSaudiIban('US4420000001234567891234')).toBe(false);
  });
  it('formatIban يجمّع رباعياً', () => {
    expect(formatIban('SA0380000000608010167519')).toBe('SA03 8000 0000 6080 1016 7519');
  });
});
