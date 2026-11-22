import { describe, expect, it } from 'vitest';
import { fieldMessage } from './api';
import { csvCell } from './csv';

describe('csvCell', () => {
  it('quotes and escapes', () => expect(csvCell('a "b"')).toBe('"a ""b"""'));
  it('neutralises formulas', () => {
    for (const v of ['=1+1', '+1', '-2', '@SUM(A1)', '\t=x']) expect(csvCell(v).startsWith(`"'`)).toBe(true);
  });
  it('handles empty values', () => expect(csvCell(null)).toBe('""'));
});

describe('fieldMessage', () => {
  it('maps known codes', () => expect(fieldMessage('Required')).toBe('حقل إلزامي'));
  it('translates zod defaults', () =>
    expect(fieldMessage('String must contain at least 10 character(s)')).toBe('يجب ألا يقل عن 10 أحرف'));
  it('never shows raw English', () => expect(fieldMessage('Something odd')).toBe('قيمة غير صحيحة'));
  it('is empty for no error', () => expect(fieldMessage(undefined)).toBeUndefined());
});
