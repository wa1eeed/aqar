import { Inject, Injectable } from '@nestjs/common';
import { createHmac, hkdfSync } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

export type HashPurpose = 'refresh-token' | 'otp' | 'recovery-code' | 'reset-token' | 'invite-token';

/**
 * HMAC-SHA256 with a separate key per purpose (HKDF from JWT_REFRESH_SECRET). Used for values that
 * are high-entropy or short-lived and must be looked up by hash (tokens, OTP codes). Without the
 * server secret a leaked table cannot be brute-forced offline.
 */
@Injectable()
export class KeyedHashService {
  private readonly keys = new Map<HashPurpose, Buffer>();

  constructor(@Inject(ENV) private readonly env: Pick<Env, 'JWT_REFRESH_SECRET'>) {}

  hash(purpose: HashPurpose, value: string): string {
    let key = this.keys.get(purpose);
    if (!key) {
      key = Buffer.from(hkdfSync('sha256', this.env.JWT_REFRESH_SECRET, 'nx', `nx:${purpose}`, 32));
      this.keys.set(purpose, key);
    }
    return createHmac('sha256', key).update(value).digest('base64url');
  }
}
