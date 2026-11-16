import { z } from 'zod';

export const OFFER = z.enum(['sale', 'rent', 'investment']);
export const PAYMENT_METHOD = z.enum(['moyasar', 'bank_transfer', 'rize']);
export const PAYMENT_TYPE = z.enum(['deposit', 'full']);
export const halalas = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time');
export const isoDateOrEmpty = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date')]);

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Unique, non-empty array of enum values. */
export const uniqueList = <T extends z.ZodTypeAny>(item: T) =>
  z.array(item).refine((a) => new Set(a).size === a.length, 'duplicate_values');
