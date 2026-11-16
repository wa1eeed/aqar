import { z } from 'zod';
import { plainText, richText } from '../../../common/security/zod-helpers';
import { halalas, OFFER, PAYMENT_METHOD, PAYMENT_TYPE, uniqueList } from './common';

/** Payment policy per offer (docs/04 §2). Also the shape of `Property.paymentPolicy`. */
export const policySchema = z
  .object({
    paymentTypes: uniqueList(PAYMENT_TYPE).pipe(z.array(PAYMENT_TYPE).min(1)),
    defaultPaymentType: PAYMENT_TYPE,
    deposit: z
      .object({
        mode: z.enum(['fixed', 'percent']),
        fixedAmount: halalas,
        percent: z.number().min(0).max(100),
        min: halalas.nullable(),
        max: halalas.nullable(),
      })
      .strict()
      .refine((d) => d.min === null || d.max === null || d.min <= d.max, {
        message: 'min_greater_than_max',
        path: ['max'],
      }),
    methods: z.object({ deposit: uniqueList(PAYMENT_METHOD), full: uniqueList(PAYMENT_METHOD) }).strict(),
  })
  .strict()
  .refine((p) => p.paymentTypes.includes(p.defaultPaymentType), {
    message: 'default_not_in_payment_types',
    path: ['defaultPaymentType'],
  });

export type Policy = z.infer<typeof policySchema>;

const salePolicy: Policy = {
  paymentTypes: ['deposit', 'full'],
  defaultPaymentType: 'deposit',
  deposit: { mode: 'fixed', fixedAmount: 5_000_000, percent: 0, min: null, max: null },
  methods: { deposit: ['moyasar', 'bank_transfer'], full: ['bank_transfer'] },
};
const rentPolicy: Policy = {
  paymentTypes: ['deposit', 'full'],
  defaultPaymentType: 'deposit',
  deposit: { mode: 'percent', fixedAmount: 0, percent: 10, min: 100_000, max: null },
  methods: { deposit: ['moyasar', 'bank_transfer'], full: ['moyasar', 'bank_transfer', 'rize'] },
};

export const bookingSettings = z
  .object({
    enabled: z.boolean().default(true),
    allowedOffers: uniqueList(OFFER).default(['sale', 'rent']),
    policies: z
      .object({
        sale: policySchema.default(salePolicy),
        rent: policySchema.default(rentPolicy),
        investment: policySchema.default(salePolicy),
      })
      .strict()
      .default({}),
    holdMinutesOnline: z
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(30),
    holdHoursTransfer: z
      .number()
      .int()
      .min(1)
      .max(14 * 24)
      .default(48),
    reviewHoursTransfer: z
      .number()
      .int()
      .min(1)
      .max(14 * 24)
      .default(24),
    autoConfirmWhenPaid: z.boolean().default(true),
    nafathRequiredAbove: halalas.nullable().default(null),
    termsVersion: plainText(20).pipe(z.string().min(1)).default('1'),
    termsHtml: richText(50_000).default('<p>تُطبّق شروط الحجز المعتمدة لدى المنشأة.</p>'),
    cancellationPolicyHtml: richText(50_000).default('<p>تُطبّق سياسة الإلغاء المعتمدة لدى المنشأة.</p>'),
  })
  .strict();
