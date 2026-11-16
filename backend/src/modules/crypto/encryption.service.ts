import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DecryptionError extends Error {
  constructor() {
    super('decryption failed');
  }
}

/**
 * AES-256-GCM for integration secrets and TOTP seeds (docs/05 §1.2).
 * Stored format: iv(12) | tag(16) | ciphertext. A random IV per write. An optional "context"
 * (e.g. the integration key) is bound as additional authenticated data, so a ciphertext copied to
 * another row fails to decrypt.
 */
@Injectable()
export class EncryptionService {
  private readonly current: Buffer;
  private readonly previous: Buffer | null;

  constructor(@Inject(ENV) env: Pick<Env, 'APP_ENCRYPTION_KEY' | 'APP_ENCRYPTION_KEY_PREVIOUS'>) {
    this.current = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
    this.previous = env.APP_ENCRYPTION_KEY_PREVIOUS ? Buffer.from(env.APP_ENCRYPTION_KEY_PREVIOUS, 'base64') : null;
  }

  encrypt(plaintext: Buffer | string, context = ''): Buffer {
    return EncryptionService.encryptWith(this.current, Buffer.from(plaintext), context);
  }

  decrypt(payload: Buffer | Uint8Array, context = ''): Buffer {
    const buf = Buffer.from(payload);
    try {
      return EncryptionService.decryptWith(this.current, buf, context);
    } catch {
      if (!this.previous) throw new DecryptionError();
      try {
        return EncryptionService.decryptWith(this.previous, buf, context);
      } catch {
        throw new DecryptionError();
      }
    }
  }

  encryptJson(value: unknown, context = ''): Buffer {
    return this.encrypt(JSON.stringify(value), context);
  }

  decryptJson<T>(payload: Buffer | Uint8Array, context = ''): T {
    return JSON.parse(this.decrypt(payload, context).toString('utf8')) as T;
  }

  static encryptWith(key: Buffer, plaintext: Buffer, context: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]);
  }

  static decryptWith(key: Buffer, payload: Buffer, context: string): Buffer {
    if (payload.length < IV_BYTES + TAG_BYTES) throw new DecryptionError();
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ct = payload.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    if (context) decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

/** Constant-time comparison of two strings (tokens, signatures). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
