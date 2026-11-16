import { z } from 'zod';
import { plainText, richText } from '../../../common/security/zod-helpers';

export const ACCEPTED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const bankTransferSettings = z
  .object({
    bankAccountIds: z.array(z.string().min(1).max(40)).max(20).default([]),
    instructionsHtml: richText(20_000).default(
      '<p>حوّل المبلغ المطلوب إلى أحد الحسابات التالية ثم ارفع إيصال التحويل.</p>',
    ),
    nextSteps: z
      .array(plainText(200).pipe(z.string().min(1)))
      .max(10)
      .default([
        'نراجع الإيصال خلال 24 ساعة عمل',
        'نؤكد الحجز ويصلك إشعار وبريد',
        'يتواصل معك المستشار لإكمال الإجراءات',
      ]),
    referenceHintAr: plainText(200).default('اكتب رقم الحجز في خانة الملاحظات عند التحويل'),
    requireReceipt: z.boolean().default(true),
    acceptedFileTypes: z
      .array(z.enum(ACCEPTED_RECEIPT_TYPES))
      .min(1)
      .default([...ACCEPTED_RECEIPT_TYPES]),
    maxFileMb: z.number().int().min(1).max(10).default(10),
  })
  .strict();
