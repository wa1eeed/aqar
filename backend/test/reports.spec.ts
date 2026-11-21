import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/modules/reports/csv.js';

describe('toCsv', () => {
  it('يبني CSV مع رؤوس', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(csv).toBe('a,b\n1,x\n2,y\n');
  });
  it('يهرب الفواصل وعلامات الاقتباس والأسطر', () => {
    const csv = toCsv([{ name: 'a,b', note: 'he said "hi"' }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"he said ""hi"""');
  });
  it('صفوف فارغة', () => {
    expect(toCsv([], ['x', 'y'])).toBe('x,y\n');
  });
});
