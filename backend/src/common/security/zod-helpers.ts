import { z } from 'zod';
import { sanitizeRichText } from './html';

/** http(s) URL only — `z.string().url()` alone accepts `javascript:` URLs. */
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'invalid_url');

/** Optional URL stored as '' when unset. */
export const optionalHttpUrl = z.union([z.literal(''), httpUrl]).default('');

/** Same-site path (`/…`), never protocol-relative (`//evil.com`). */
export const relativePath = z
  .string()
  .trim()
  .max(512)
  .regex(/^\/(?!\/)[^\s]*$/, 'invalid_path');

export const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), 'html_not_allowed');

export const richText = (max: number) => z.string().max(max).transform(sanitizeRichText);

export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'invalid_color');

/** Saudi mobile in E.164 (+9665XXXXXXXX) or '' */
export const saudiMobileE164 = z.union([z.literal(''), z.string().regex(/^\+9665\d{8}$/, 'invalid_phone')]);

export const email = z.string().trim().toLowerCase().max(254).email('invalid_email');

/**
 * Array with the length checked BEFORE elements are validated (zod 3 otherwise validates every
 * element of an oversized array and records an issue for each). Use instead of `z.array(x).max(n)`.
 */
export const boundedArray = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.array(z.unknown()).max(max).pipe(z.array(item));
