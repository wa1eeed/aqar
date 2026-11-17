import { createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — the format every authenticator app supports. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SEC = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20)); // 160-bit, as recommended by RFC 4226
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0xf;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Returns the matched time step (for replay protection) or null. Accepts ±1 step for clock drift.
 * Comparison is over all candidates so timing does not reveal which step matched.
 */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = Math.floor(now / 1000 / TOTP_STEP_SEC);
  let matched: number | null = null;
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secret, step + i);
    let diff = 0;
    for (let j = 0; j < 6; j++) diff |= candidate.charCodeAt(j) ^ code.charCodeAt(j);
    if (diff === 0 && matched === null) matched = step + i;
  }
  return matched;
}

export function otpauthUrl(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 10 one-time recovery codes, e.g. "k7vq-3mzp" (40 bits each). */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const s = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export function normaliseRecoveryCode(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z2-7]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : '';
}
