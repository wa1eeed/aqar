import { z } from 'zod';

export const paymentsSchema = z.object({
  moyasar: z
    .object({
      enabled: z.boolean().default(false),
      labelAr: z.string().default('الدفع الإلكتروني'),
      mode: z.enum(['invoice', 'embedded_form']).default('invoice'),
      sources: z.array(z.enum(['creditcard', 'applepay', 'stcpay'])).default(['creditcard']),
      statementDescriptor: z.string().default('MANZILAH'),
    })
    .default({}),
  bank_transfer: z
    .object({
      enabled: z.boolean().default(true),
      labelAr: z.string().default('تحويل بنكي'),
    })
    .default({}),
  rize: z
    .object({
      enabled: z.boolean().default(false),
      labelAr: z.string().default('قسّط إيجارك مع رايز'),
      onlyRentPeriods: z.array(z.enum(['yearly'])).default(['yearly']),
    })
    .default({}),
  receiptPrefix: z.string().default('R'),
  showVatNote: z.boolean().default(false),
  vatNoteAr: z.string().default(''),
});

export type PaymentsSettings = z.infer<typeof paymentsSchema>;
