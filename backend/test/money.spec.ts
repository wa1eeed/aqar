import { describe, it, expect } from 'vitest';
import { sarToHalalas, halalasToSar, formatSar, toPriceSar, HALALAS_PER_SAR } from '../src/common/money.js';

describe('money — المال بالهللات (BigInt)', () => {
  it('sarToHalalas يحوّل الريال إلى هللات صحيحة', () => {
    expect(sarToHalalas(950)).toBe(95000n);
    expect(sarToHalalas(0.01)).toBe(1n);
    expect(sarToHalalas(1234.56)).toBe(123456n);
  });

  it('halalasToSar يعكس التحويل', () => {
    expect(halalasToSar(95000n)).toBe(950);
    expect(halalasToSar(1n)).toBe(0.01);
  });

  it('رحلة ذهاب وإياب تحفظ القيمة', () => {
    for (const sar of [0, 1, 950, 12345.67, 1_000_000]) {
      expect(halalasToSar(sarToHalalas(sar))).toBeCloseTo(sar, 2);
    }
  });

  it('formatSar يعرض أرقاماً لاتينية مفصولة + ر.س', () => {
    expect(formatSar(95000n)).toBe('950 ر.س');
    expect(formatSar(1234567n)).toBe('12,345.67 ر.س');
    expect(formatSar(0n)).toBe('0 ر.س');
  });

  it('toPriceSar = halalasToSar (لحمولات الواجهة)', () => {
    expect(toPriceSar(95000n)).toBe(950);
  });

  it('ثابت التحويل', () => {
    expect(HALALAS_PER_SAR).toBe(100n);
  });
});
