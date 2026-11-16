import { z } from 'zod';
import { plainText, richText } from '../../../common/security/zod-helpers';

export const legalSettings = z
  .object({
    aboutHtml: richText(50_000).default(''),
    privacyHtml: richText(100_000).default(''),
    termsHtml: richText(100_000).default(''),
    cookieNotice: plainText(500).default(
      'نستخدم ملفات تعريف الارتباط الضرورية لتشغيل الموقع، ولا نفعّل أدوات التحليل إلا بموافقتك.',
    ),
  })
  .strict();
