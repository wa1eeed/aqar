import { z } from 'zod';
import { optionalHttpUrl, plainText } from '../../../common/security/zod-helpers';
import { isoDateOrEmpty } from './common';

const digits = (min: number, max: number) =>
  z.union([z.literal(''), z.string().regex(new RegExp(`^\\d{${min},${max}}$`), 'invalid_number')]).default('');

/** REGA / Ejar licensing (docs/07 §10.2). Empty until the company enters its real numbers. */
export const licensingSettings = z
  .object({
    regaFalLicense: digits(6, 15),
    regaFalExpiry: isoDateOrEmpty.default(''),
    regaVerifyUrl: optionalHttpUrl,
    ejarMembership: digits(3, 20),
    crNumber: digits(10, 10),
    vatNumber: digits(15, 15),
    nationalAddress: plainText(200).default(''),
    showRegaInFooter: z.boolean().default(true),
    showEjarInFooter: z.boolean().default(true),
    showOnPropertyPage: z.boolean().default(true),
    showEjarOnRentOnly: z.boolean().default(true),
  })
  .strict();
