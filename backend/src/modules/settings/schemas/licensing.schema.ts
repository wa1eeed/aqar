import { z } from 'zod';

export const licensingSchema = z.object({
  regaFalLicense: z.string().default(''),
  regaFalExpiry: z.string().nullable().default(null),
  regaVerifyUrl: z.string().url().or(z.literal('')).default(''),
  ejarMembership: z.string().default(''),
  crNumber: z.string().default(''),
  vatNumber: z.string().default(''),
  nationalAddress: z.string().default(''),
  showRegaInFooter: z.boolean().default(true),
  showEjarInFooter: z.boolean().default(true),
  showOnPropertyPage: z.boolean().default(true),
  showEjarOnRentOnly: z.boolean().default(true),
});

export type LicensingSettings = z.infer<typeof licensingSchema>;
