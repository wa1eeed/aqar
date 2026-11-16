import { z } from 'zod';
import { optionalHttpUrl, plainText } from '../../../common/security/zod-helpers';
import { isValidTimeZone } from './common';

export const generalSettings = z
  .object({
    listingCodePrefix: z
      .string()
      .regex(/^[A-Z]{1,6}$/, 'invalid_prefix')
      .default('MZ'),
    timezone: z.string().refine(isValidTimeZone, 'invalid_timezone').default('Asia/Riyadh'),
    defaultPageSize: z.number().int().min(1).max(100).default(12),
    maintenanceMode: z.boolean().default(false),
    maintenanceMessage: plainText(300).default('الموقع تحت الصيانة حالياً، نعود قريباً.'),
    publicUrl: optionalHttpUrl,
  })
  .strict();
