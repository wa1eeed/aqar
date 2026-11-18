import { z } from 'zod';
import { fieldsFor } from './helpers.js';
import type { FieldDef } from './types.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function zodForField(f: FieldDef): z.ZodTypeAny {
  switch (f.kind) {
    case 'number':
      return z.number().nonnegative();
    case 'money':
      // المبالغ مخزّنة بالهللات كأعداد صحيحة موجبة
      return z.number().int().nonnegative();
    case 'bool':
      return z.boolean();
    case 'text':
      return z.string().max(120);
    case 'date':
      return z.string().regex(ISO_DATE, 'تاريخ غير صالح، استخدم الصيغة YYYY-MM-DD');
    case 'select': {
      const keys = Object.keys(f.options ?? {});
      if (keys.length === 0) return z.string();
      return z.enum(keys as [string, ...string[]]);
    }
    default:
      return z.unknown();
  }
}

/**
 * يبني zod object للتحقق من Property.specs حسب نوع العقار والعرض.
 * الحقول المطلوبة (required) تُفرض؛ الباقي اختياري. المفاتيح غير المعروفة تُحذف.
 */
export function buildSpecsZod(type: string, offer: string): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const f of fieldsFor(type, offer)) {
    const base = zodForField(f);
    shape[f.key] = f.required ? base : base.optional();
  }
  return z.object(shape);
}
