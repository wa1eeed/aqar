import { describe, it, expect } from 'vitest';
import { fieldsFor, field, statusesFor, city, isClosed, buildSpecsZod } from '../src/index.js';

describe('helpers', () => {
  it('fieldsFor يرشّح حسب النوع والعرض', () => {
    const keys = fieldsFor('villa', 'sale').map((f) => f.key);
    expect(keys).toContain('area');
    expect(keys).toContain('bedrooms');
    expect(keys).not.toContain('payments'); // حقل إيجار فقط
  });

  it('statusesFor(rent) تستثني "تم البيع"', () => {
    expect(statusesFor('rent')).toEqual(['available', 'negotiation', 'reserved', 'rented']);
  });

  it('isClosed', () => {
    expect(isClosed('sold')).toBe(true);
    expect(isClosed('available')).toBe(false);
  });

  it('city + field', () => {
    expect(city('riyadh')?.label).toBe('الرياض');
    expect(field('area')?.required).toBe(true);
    expect(field('nope')).toBeNull();
  });
});

describe('buildSpecsZod', () => {
  it('يفرض المساحة والتراخيص ويتحقق من الأنواع', () => {
    const spec = buildSpecsZod('villa', 'sale');
    expect(
      spec.safeParse({ area: 400, adLicense: 'A1', falLicense: 'F1', bedrooms: 4, pool: true }).success,
    ).toBe(true);
    expect(spec.safeParse({ bedrooms: 4 }).success).toBe(false); // ناقص الحقول المطلوبة
  });

  it('يرفض الأرقام السالبة وقيم select غير الصحيحة', () => {
    const spec = buildSpecsZod('villa', 'sale');
    expect(spec.safeParse({ area: -1, adLicense: 'A', falLicense: 'F' }).success).toBe(false);
    expect(
      spec.safeParse({ area: 1, adLicense: 'A', falLicense: 'F', facade: 'bogus' }).success,
    ).toBe(false);
  });
});
