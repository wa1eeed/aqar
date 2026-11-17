import { base32Decode, base32Encode, generateRecoveryCodes, hotp, normaliseRecoveryCode, verifyTotp } from './totp';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 appendix B test vectors (SHA-1, secret "12345678901234567890"), last 6 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('t=%i → %s', (t, code) => {
    expect(hotp(base32Decode(secret), Math.floor(t / 30))).toBe(code);
    expect(verifyTotp(secret, code, t * 1000)).toBe(Math.floor(t / 30));
  });

  it('accepts ±1 step drift only and rejects malformed codes', () => {
    const t = 1111111109 * 1000;
    expect(verifyTotp(secret, '081804', t + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, '081804', t + 90_000)).toBeNull();
    expect(verifyTotp(secret, '08180', t)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', t)).toBeNull();
  });

  it('base32 round-trips', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it('recovery codes are unique and normalise from user input', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(normaliseRecoveryCode(` ${codes[0]!.toUpperCase().replace('-', ' ')} `)).toBe(codes[0]);
  });
});
