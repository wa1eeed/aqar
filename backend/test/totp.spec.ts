import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { TotpService } from '../src/modules/auth/totp.service.js';

const svc = new TotpService();

describe('TotpService — المصادقة الثنائية (RFC 6238)', () => {
  it('generateSecret ينتج سرّاً base32', () => {
    const secret = svc.generateSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('verify يقبل رمزاً صحيحاً', () => {
    const secret = svc.generateSecret();
    const token = authenticator.generate(secret);
    expect(svc.verify(token, secret)).toBe(true);
  });

  it('verify يرفض رمزاً خاطئاً أو مشوّهاً دون أن يرمي', () => {
    const secret = svc.generateSecret();
    expect(svc.verify('000001', secret)).toBe(false);
    expect(svc.verify('ليس رمزاً', secret)).toBe(false);
    expect(svc.verify('', secret)).toBe(false);
  });

  it('keyUri يبني otpauth:// بالمُصدِر والحساب', () => {
    const uri = svc.keyUri('owner@demo.local', svc.generateSecret());
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('issuer=');
    expect(decodeURIComponent(uri)).toContain('منزلة');
  });
});
