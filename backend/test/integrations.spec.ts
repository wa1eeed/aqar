import { describe, it, expect } from 'vitest';
import { redactIntegration, redactAndTruncate } from '../src/modules/integrations/redaction.js';
import { CircuitBreaker } from '../src/modules/integrations/circuit-breaker.js';
import { getProvider, providersByScope } from '../src/modules/integrations/registry.js';

describe('redactIntegration', () => {
  it('يحجب مفاتيح الأسرار (آخر 4) ويُبقي البقية', () => {
    const r = redactIntegration({
      apiKey: 'sk_live_abcd1234',
      fromEmail: 'a@b.com',
      nested: { secretKey: 'xyz9999', ok: 1 },
    }) as { apiKey: string; fromEmail: string; nested: { secretKey: string; ok: number } };
    expect(r.apiKey).toBe('••••1234');
    expect(r.fromEmail).toBe('a@b.com');
    expect(r.nested.secretKey).toBe('••••9999');
    expect(r.nested.ok).toBe(1);
  });

  it('يقتطع الأجسام الكبيرة', () => {
    const big = { blob: 'x'.repeat(20000) };
    const out = redactAndTruncate(big) as { _truncated?: boolean };
    expect(out._truncated).toBe(true);
  });
});

describe('CircuitBreaker', () => {
  it('يفتح بعد 5 إخفاقات ويتعافى بعد التهدئة', () => {
    const b = new CircuitBreaker(5, 1000);
    for (let i = 0; i < 5; i++) b.recordFailure(1000);
    expect(b.isOpen(1500)).toBe(true);
    expect(b.isOpen(2500)).toBe(false);
  });

  it('النجاح يصفّر العدّاد', () => {
    const b = new CircuitBreaker(5, 1000);
    for (let i = 0; i < 4; i++) b.recordFailure(1000);
    b.recordSuccess();
    b.recordFailure(1000);
    expect(b.isOpen(1500)).toBe(false);
  });
});

describe('provider registry', () => {
  it('المزوّدون المنصّيون يشملون osm/overpass/resend/r2', () => {
    const keys = providersByScope('platform').map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['maps.osm', 'places.overpass', 'email.resend', 'storage.r2']));
  });

  it('المزوّدون المُهيّأون يعيدون "بانتظار بيانات الربط"', async () => {
    const rega = getProvider('gov.rega');
    expect(rega?.prepared).toBe(true);
    const res = await rega!.testConnection({ config: {}, secrets: {}, environment: 'sandbox' });
    expect(res.ok).toBe(false);
    expect(res.messageAr).toContain('بانتظار');
  });

  it('maps.google بنطاق المشترك', () => {
    expect(getProvider('maps.google')?.scope).toBe('tenant');
  });
});
