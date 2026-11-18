import { z } from 'zod';

export const contactSchema = z.object({
  phone: z.string().default('+966500000000'),
  phoneDisplay: z.string().default('050 000 0000'),
  whatsapp: z.string().default('966500000000'),
  email: z.string().email().or(z.literal('')).default('info@example.com'),
  address: z.string().default(''),
  hours: z.string().default('الأحد – الخميس، 9 ص – 9 م'),
  officeLat: z.number().nullable().default(null),
  officeLng: z.number().nullable().default(null),
  social: z
    .object({
      x: z.string().default(''),
      instagram: z.string().default(''),
      snapchat: z.string().default(''),
      tiktok: z.string().default(''),
      linkedin: z.string().default(''),
      youtube: z.string().default(''),
    })
    .default({}),
});

export type ContactSettings = z.infer<typeof contactSchema>;
