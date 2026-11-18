import { z } from 'zod';

const paymentMethodEnum = z.enum(['moyasar', 'bank_transfer', 'rize']);

/** سياسة الدفع لكل عرض (docs/04 §2). تُعاد نفس الصيغة في Property.paymentPolicy. */
export const policySchema = z.object({
  paymentTypes: z.array(z.enum(['deposit', 'full'])).default(['deposit', 'full']),
  defaultPaymentType: z.enum(['deposit', 'full']).default('deposit'),
  deposit: z
    .object({
      mode: z.enum(['fixed', 'percent']).default('percent'),
      fixedAmount: z.number().int().nonnegative().default(0),
      percent: z.number().min(0).max(100).default(10),
      min: z.number().int().nonnegative().nullable().default(null),
      max: z.number().int().nonnegative().nullable().default(null),
    })
    .default({}),
  methods: z
    .object({
      deposit: z.array(paymentMethodEnum).default(['moyasar', 'bank_transfer']),
      full: z.array(paymentMethodEnum).default(['bank_transfer']),
    })
    .default({}),
});

export type Policy = z.infer<typeof policySchema>;

export const bookingSchema = z.object({
  enabled: z.boolean().default(true),
  allowedOffers: z.array(z.enum(['sale', 'rent', 'investment'])).default(['sale', 'rent']),
  policies: z
    .object({
      sale: policySchema.default({}),
      rent: policySchema.default({}),
      investment: policySchema.default({}),
    })
    .default({}),
  holdMinutesOnline: z.number().int().positive().default(30),
  holdHoursTransfer: z.number().int().positive().default(48),
  reviewHoursTransfer: z.number().int().positive().default(24),
  autoConfirmWhenPaid: z.boolean().default(true),
  nafathRequiredAbove: z.number().int().nonnegative().nullable().default(null),
  termsVersion: z.string().default('1'),
  termsHtml: z.string().default(''),
  cancellationPolicyHtml: z.string().default(''),
});

export type BookingSettings = z.infer<typeof bookingSchema>;
