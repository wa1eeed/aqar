import { z } from 'zod';

export const bankTransferSchema = z.object({
  bankAccountIds: z.array(z.string()).default([]),
  instructionsHtml: z.string().default(''),
  nextSteps: z.array(z.string()).default([]),
  referenceHintAr: z.string().default('اكتب رقم الحجز في خانة الملاحظات عند التحويل'),
  requireReceipt: z.boolean().default(true),
  acceptedFileTypes: z
    .array(z.string())
    .default(['application/pdf', 'image/jpeg', 'image/png']),
  maxFileMb: z.number().int().positive().default(10),
});

export type BankTransferSettings = z.infer<typeof bankTransferSchema>;
