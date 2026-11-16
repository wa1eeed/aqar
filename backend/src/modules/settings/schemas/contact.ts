import { z } from 'zod';
import { email, optionalHttpUrl, plainText, saudiMobileE164 } from '../../../common/security/zod-helpers';

export const contactSettings = z
  .object({
    phone: saudiMobileE164.default('+966500000000'),
    phoneDisplay: plainText(30).default('050 000 0000'),
    whatsapp: z.union([z.literal(''), z.string().regex(/^9665\d{8}$/, 'invalid_whatsapp')]).default('966500000000'),
    email: z.union([z.literal(''), email]).default('info@example.com'),
    address: plainText(200).default('[عنوان المقر الرئيسي]، الرياض'),
    hours: plainText(120).default('الأحد – الخميس، 9 ص – 9 م'),
    officeLat: z.number().min(-90).max(90).nullable().default(24.7136),
    officeLng: z.number().min(-180).max(180).nullable().default(46.6753),
    social: z
      .object({
        x: optionalHttpUrl,
        instagram: optionalHttpUrl,
        snapchat: optionalHttpUrl,
        tiktok: optionalHttpUrl,
        linkedin: optionalHttpUrl,
        youtube: optionalHttpUrl,
      })
      .strict()
      .default({}),
  })
  .strict();
