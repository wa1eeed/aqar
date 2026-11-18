import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const IV_LEN = 12; // GCM nonce
const TAG_LEN = 16;

/**
 * تشفير أسرار التكاملات بخوارزمية AES-256-GCM.
 * الصيغة المخزّنة: [iv(12) | tag(16) | ciphertext].
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('APP_ENCRYPTION_KEY') ?? '';
    this.key = EncryptionService.deriveKey(raw);
  }

  static deriveKey(raw: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const b64 = tryBase64(raw);
    if (b64 && b64.length === 32) return b64;
    // اشتقاق حتمي لمفتاح 32 بايت من أي نص (الحد الأدنى للطول مفروض في env.ts)
    return createHash('sha256').update(raw, 'utf8').digest();
  }

  encrypt(plain: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  decrypt(blob: Buffer): string {
    const iv = blob.subarray(0, IV_LEN);
    const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = blob.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown): Buffer {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(blob: Buffer): T {
    return JSON.parse(this.decrypt(blob)) as T;
  }

  /** قناع للعرض فقط: "••••a1b2" (آخر 4 محارف). */
  mask(value: string): string {
    const tail = value.length <= 4 ? value : value.slice(-4);
    return `••••${tail}`;
  }
}

function tryBase64(raw: string): Buffer | null {
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
}
