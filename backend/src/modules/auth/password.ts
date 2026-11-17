import * as argon2 from 'argon2';
import { z } from 'zod';

/** docs/03 §1: Argon2id, memoryCost 19456, timeCost 2. */
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Verified against when the account does not exist, so response time does not reveal valid emails.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= hashPassword('nx-dummy-password-for-timing');
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  'password1234',
  '123456789012',
  'qwertyuiop12',
  'admin1234567',
  'password@123',
  'welcome12345',
]);

/** 12–128 chars, not trivially common, does not contain the email name. */
export function passwordSchema(email?: string) {
  return z
    .string()
    .min(12, 'password_too_short')
    .max(128, 'password_too_long')
    .refine((p) => !COMMON.has(p.toLowerCase()), 'password_too_common')
    .refine((p) => new Set(p).size >= 5, 'password_too_simple')
    .refine((p) => {
      const local = email?.split('@')[0]?.toLowerCase();
      return !local || local.length < 4 || !p.toLowerCase().includes(local);
    }, 'password_contains_email');
}
