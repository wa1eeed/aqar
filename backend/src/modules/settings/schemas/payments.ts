import { z } from 'zod';
import { plainText } from '../../../common/security/zod-helpers';
import { uniqueList } from './common';

export const paymentsSettings = z
  .object({
    moyasar: z
      .object({
        enabled: z.boolean().default(false),
        labelAr: plainText(60).default('الدفع الإلكتروني'),
        mode: z.enum(['invoice', 'embedded_form']).default('invoice'),
        sources: uniqueList(z.enum(['creditcard', 'applepay', 'stcpay'])).default(['creditcard', 'applepay', 'stcpay']),
        statementDescriptor: plainText(40).default(''),
      })
      .strict()
      .default({}),
    bank_transfer: z
      .object({ enabled: z.boolean().default(true), labelAr: plainText(60).default('تحويل بنكي') })
      .strict()
      .default({}),
    rize: z
      .object({
        enabled: z.boolean().default(false),
        labelAr: plainText(60).default('قسّط إيجارك مع رايز'),
        onlyRentPeriods: uniqueList(z.enum(['yearly'])).default(['yearly']),
      })
      .strict()
      .default({}),
    receiptPrefix: z
      .string()
      .regex(/^[A-Z]{1,4}$/, 'invalid_prefix')
      .default('R'),
    showVatNote: z.boolean().default(false),
    vatNoteAr: plainText(300).default(''),
  })
  .strict();
