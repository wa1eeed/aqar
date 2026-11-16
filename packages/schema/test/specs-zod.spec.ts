import { describe, expect, it } from 'vitest';
import { buildSpecsZod, fieldsFor, isOfferAllowedForType, statusesFor } from '../src';

const base = { area: 450, adLicense: '7100000001', falLicense: '1100000000' };

describe('buildSpecsZod', () => {
  it('accepts a valid villa/sale specs object', () => {
    const s = buildSpecsZod('villa', 'sale');
    const r = s.safeParse({ ...base, bedrooms: 5, facade: 'north', pool: true, licenseExpiry: '2027-05-10' });
    expect(r.success).toBe(true);
  });

  it('enforces required fields', () => {
    const r = buildSpecsZod('villa', 'sale').safeParse({ area: 100 });
    expect(r.success).toBe(false);
  });

  it('rejects fields that do not apply to the type/offer', () => {
    // wells is farm-only; annualIncome is investment-only
    expect(buildSpecsZod('villa', 'sale').safeParse({ ...base, wells: 2 }).success).toBe(false);
    expect(buildSpecsZod('villa', 'sale').safeParse({ ...base, annualIncome: 1000 }).success).toBe(false);
  });

  it('validates kinds: select options, negative numbers, money integers, dates, text length', () => {
    const villa = buildSpecsZod('villa', 'sale');
    expect(villa.safeParse({ ...base, facade: 'up' }).success).toBe(false);
    expect(villa.safeParse({ ...base, area: -1 }).success).toBe(false);
    expect(villa.safeParse({ ...base, licenseExpiry: '2027-02-30' }).success).toBe(false);
    expect(villa.safeParse({ ...base, adLicense: 'x'.repeat(121) }).success).toBe(false);
    expect(villa.safeParse({ ...base, adLicense: '   ' }).success).toBe(false);
    const inv = buildSpecsZod('building', 'investment');
    expect(inv.safeParse({ ...base, annualIncome: 100.5 }).success).toBe(false);
    expect(inv.safeParse({ ...base, annualIncome: 10_000_000 }).success).toBe(true);
  });

  it('throws for an offer not allowed for the type', () => {
    expect(isOfferAllowedForType('farm', 'rent')).toBe(false);
    expect(() => buildSpecsZod('farm', 'rent')).toThrow();
    expect(() => buildSpecsZod('nope', 'sale')).toThrow();
  });

  it('keeps helper semantics', () => {
    expect(statusesFor('rent')).toEqual(['available', 'negotiation', 'reserved', 'rented']);
    expect(fieldsFor('farm', 'sale').some((f) => f.key === 'wells')).toBe(true);
  });
});
