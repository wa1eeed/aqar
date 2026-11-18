import { z } from 'zod';

export const legalSchema = z.object({
  about: z.string().default(''),
  privacy: z.string().default(''),
  terms: z.string().default(''),
  bookingTerms: z
    .object({
      version: z.string().default('1'),
      html: z.string().default(''),
    })
    .default({}),
  cookieNotice: z.string().default(''),
});

export type LegalSettings = z.infer<typeof legalSchema>;
