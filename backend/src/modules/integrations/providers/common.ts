import { z } from 'zod';
import { httpUrl } from '../../../common/security/zod-helpers';

export const optionalUrl = z.union([z.literal(''), httpUrl]).default('');
export const secret = (max = 512) => z.string().trim().min(8).max(max);
export const rateLimit = z.number().int().min(1).max(10_000).optional();
/** Non-secret identifier (account ids, bucket names…). */
export const ident = (max = 120) =>
  z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._:@\-/ ]+$/, 'invalid_value')
        .max(max),
    ])
    .default('');
