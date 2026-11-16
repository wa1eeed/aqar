import { randomBytes } from 'node:crypto';
import { DecryptionError, EncryptionService } from './encryption.service';

const key = () => randomBytes(32).toString('base64');

describe('EncryptionService (AES-256-GCM)', () => {
  const k1 = key();
  const svc = new EncryptionService({ APP_ENCRYPTION_KEY: k1, APP_ENCRYPTION_KEY_PREVIOUS: undefined });

  it('round-trips JSON and uses a fresh IV per write', () => {
    const a = svc.encryptJson({ apiKey: 'sk_live_123' }, 'payments.moyasar');
    const b = svc.encryptJson({ apiKey: 'sk_live_123' }, 'payments.moyasar');
    expect(a.equals(b)).toBe(false);
    expect(svc.decryptJson(a, 'payments.moyasar')).toEqual({ apiKey: 'sk_live_123' });
    // iv(12) | tag(16) | ciphertext
    expect(a.length).toBeGreaterThan(28);
  });

  it('detects tampering', () => {
    const ct = svc.encrypt('secret');
    ct[ct.length - 1] = ct[ct.length - 1]! ^ 0xff;
    expect(() => svc.decrypt(ct)).toThrow(DecryptionError);
  });

  it('binds the ciphertext to its context (AAD)', () => {
    const ct = svc.encrypt('secret', 'email.resend');
    expect(() => svc.decrypt(ct, 'payments.moyasar')).toThrow(DecryptionError);
  });

  it('rejects other keys and decrypts with the previous key during rotation', () => {
    const old = new EncryptionService({ APP_ENCRYPTION_KEY: key(), APP_ENCRYPTION_KEY_PREVIOUS: undefined });
    const ct = old.encrypt('legacy');
    expect(() => svc.decrypt(ct)).toThrow(DecryptionError);
    const rotating = new EncryptionService({
      APP_ENCRYPTION_KEY: k1,
      APP_ENCRYPTION_KEY_PREVIOUS: (old as unknown as { current: Buffer }).current.toString('base64'),
    });
    expect(rotating.decrypt(ct).toString()).toBe('legacy');
  });

  it('rejects truncated payloads', () => {
    expect(() => svc.decrypt(Buffer.alloc(10))).toThrow(DecryptionError);
  });
});
