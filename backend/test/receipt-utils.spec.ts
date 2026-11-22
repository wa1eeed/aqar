import { describe, it, expect } from 'vitest';
import { escapeHtml, receiptKey } from '../src/modules/bookings/receipt-utils.js';

describe('escapeHtml — تهريب قيم الإيصال', () => {
  it('يهرّب محارف HTML الخطرة', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`a & b "c" 'd'`)).toBe('a &amp; b &quot;c&quot; &#39;d&#39;');
  });

  it('يترك النصّ العربي العادي كما هو', () => {
    expect(escapeHtml('مالك المكتب')).toBe('مالك المكتب');
  });
});

describe('receiptKey — مفتاح تخزين واعٍ بالمستأجر', () => {
  it('يضمّ معرّف المستأجر ومعرّف الدفعة', () => {
    expect(receiptKey('t_123', 'pay_456')).toBe('tenants/t_123/receipts/pay_456.pdf');
  });

  it('مفاتيح مستأجرَين مختلفَين لا تتقاطع', () => {
    expect(receiptKey('t_a', 'p1')).not.toBe(receiptKey('t_b', 'p1'));
  });
});
