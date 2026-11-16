import { MASK, redact, redactForLog } from './redact';

describe('redact (docs/05 §6)', () => {
  it('masks sensitive keys keeping the last 4 chars, recursively', () => {
    const out = redact({
      apiKey: 'sk_live_abcdef1234',
      nested: { Authorization: 'Bearer token-value-9876', password: 'p@ssword-long', ok: 'visible' },
      list: [{ iban: 'SA0380000000608010167519' }],
      otp: '123456',
      webhookSecret: null,
      cardEnabled: true,
    });
    expect(out.apiKey).toBe(`${MASK}1234`);
    expect(out.nested.Authorization).toBe(`${MASK}9876`);
    expect(out.nested.password).toBe(`${MASK}long`);
    expect(out.nested.ok).toBe('visible');
    expect(out.list[0]!.iban).toBe(`${MASK}7519`);
    expect(out.otp).toBe(MASK); // short values are fully masked
    expect(out.webhookSecret).toBeNull();
    expect(out.cardEnabled).toBe(true);
  });

  it('serialises bigint and truncates large bodies to 8 KB', () => {
    expect(redact({ amount: 10n })).toEqual({ amount: '10' });
    const big = redactForLog({ body: 'x'.repeat(20_000) }) as { truncated: boolean; preview: string };
    expect(big.truncated).toBe(true);
    expect(Buffer.byteLength(big.preview)).toBeLessThanOrEqual(8 * 1024);
  });
});
