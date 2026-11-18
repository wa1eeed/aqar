import { z } from 'zod';

/**
 * تفعيل المدن وترتيبها والأحياء مخزّن في جداول City/District (docs/07 §10).
 * هذا القسم محجوز لأي إعدادات مواقع إضافية مستقبلاً.
 */
export const locationsSchema = z.object({}).passthrough();

export type LocationsSettings = z.infer<typeof locationsSchema>;
