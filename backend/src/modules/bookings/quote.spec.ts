import type { Policy } from '../settings/schemas/booking';
import { amountFor, depositAmount, methodsFor, paymentTypesFor, resolvePolicy, unavailableReason } from './quote';

const base: Policy = {
  paymentTypes: ['deposit', 'full'],
  defaultPaymentType: 'deposit',
  deposit: { mode: 'fixed', fixedAmount: 5_000_000, percent: 0, min: null, max: null },
  methods: { deposit: ['moyasar', 'bank_transfer'], full: ['bank_transfer', 'rize'] },
};
const settings = {
  enabled: true,
  allowedOffers: ['sale', 'rent'] as const,
  policies: { sale: base, rent: base, investment: base },
  holdMinutesOnline: 30,
  holdHoursTransfer: 48,
};
const payments = {
  moyasar: { enabled: true, labelAr: '' },
  bank_transfer: { enabled: true, labelAr: '' },
  rize: { enabled: true, labelAr: '', onlyRentPeriods: ['yearly' as const] },
};
const allReady = { moyasar: true, bank_transfer: true, rize: true };
const prop = {
  offer: 'sale' as const,
  price: 485_000_000n,
  rentPeriod: null,
  status: 'available',
  visibility: 'published',
  bookingEnabled: true,
  deletedAt: null,
  paymentPolicy: null,
};

describe('booking quote (docs/04 §2)', () => {
  it('fixed deposit, never above the full amount', () => {
    expect(depositAmount(base, 485_000_000n)).toBe(5_000_000n);
    expect(depositAmount(base, 3_000_000n)).toBe(3_000_000n);
  });

  it('percent deposit with min/max clamp', () => {
    const p: Policy = {
      ...base,
      deposit: { mode: 'percent', fixedAmount: 0, percent: 10, min: 100_000, max: 2_000_000 },
    };
    expect(depositAmount(p, 7_500_000n)).toBe(750_000n);
    expect(depositAmount(p, 500_000n)).toBe(100_000n); // min
    expect(depositAmount(p, 90_000_000n)).toBe(2_000_000n); // max
    const frac: Policy = { ...p, deposit: { ...p.deposit, percent: 2.5, min: null, max: null } };
    expect(depositAmount(frac, 1_000_000n)).toBe(25_000n);
  });

  it('rent: full amount is one rent period (the stored price)', () => {
    const rent = { ...prop, offer: 'rent' as const, price: 7_500_000n, rentPeriod: 'yearly' as const };
    expect(amountFor(base, rent, 'full')).toBe(7_500_000n);
  });

  it('a valid per-property policy wins; an invalid one is ignored', () => {
    const override: Policy = { ...base, paymentTypes: ['full'], defaultPaymentType: 'full' };
    expect(resolvePolicy(settings, { offer: 'sale', paymentPolicy: override }).paymentTypes).toEqual(['full']);
    expect(resolvePolicy(settings, { offer: 'sale', paymentPolicy: { nonsense: true } })).toBe(base);
  });

  it('methods need settings + ready integration + policy; rize only for yearly rent, full payment', () => {
    expect(methodsFor(base, 'deposit', payments, allReady, prop)).toEqual(['moyasar', 'bank_transfer']);
    expect(methodsFor(base, 'deposit', payments, { ...allReady, moyasar: false }, prop)).toEqual(['bank_transfer']);
    expect(methodsFor(base, 'full', payments, allReady, prop)).toEqual(['bank_transfer']); // sale: no rize
    expect(methodsFor(base, 'full', payments, allReady, { offer: 'rent', rentPeriod: 'yearly' })).toEqual([
      'bank_transfer',
      'rize',
    ]);
    expect(methodsFor(base, 'full', payments, allReady, { offer: 'rent', rentPeriod: 'monthly' })).toEqual([
      'bank_transfer',
    ]);
    const off = { ...payments, bank_transfer: { enabled: false, labelAr: '' } };
    expect(paymentTypesFor(base, off, { ...allReady, rize: false }, prop)).toEqual(['deposit']);
  });

  it('availability rules', () => {
    expect(unavailableReason(settings, true, prop)).toBeNull();
    expect(unavailableReason(settings, false, prop)).toBe('BOOKING_DISABLED');
    expect(unavailableReason(settings, true, { ...prop, offer: 'investment' })).toBe('OFFER_NOT_BOOKABLE');
    expect(unavailableReason(settings, true, { ...prop, bookingEnabled: false })).toBe('PROPERTY_NOT_BOOKABLE');
    expect(unavailableReason(settings, true, { ...prop, status: 'reserved' })).toBe('PROPERTY_UNAVAILABLE');
  });
});
