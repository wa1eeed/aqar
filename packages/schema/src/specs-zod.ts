import { z, type ZodTypeAny } from 'zod';
import { isOfferAllowedForType, fieldsFor } from './helpers';
import type { FieldDef } from './data';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(ISO_DATE, 'invalid_date')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'invalid_date');

function zodForField(f: FieldDef): ZodTypeAny {
  let schema: ZodTypeAny;
  switch (f.kind) {
    case 'number':
      schema = z.number().finite().nonnegative();
      break;
    case 'money':
      // Money is always an integer number of halalas (1 SAR = 100).
      schema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
      break;
    case 'select': {
      const keys = Object.keys(f.options ?? {});
      if (keys.length === 0) throw new Error(`select field ${f.key} has no options`);
      schema = z.enum(keys as [string, ...string[]]);
      break;
    }
    case 'bool':
      schema = z.boolean();
      break;
    case 'text':
      schema = f.required ? z.string().trim().min(1).max(120) : z.string().trim().max(120);
      break;
    case 'date':
      schema = isoDate;
      break;
    default: {
      const never: never = f.kind;
      throw new Error(`unknown field kind ${String(never)}`);
    }
  }
  return f.required ? schema : schema.nullish();
}

/**
 * Zod object validating `Property.specs` for a type/offer pair (docs/00 §5).
 * Unknown keys (fields that do not apply to this type/offer) are rejected.
 */
export function buildSpecsZod(type: string, offer: string) {
  if (!isOfferAllowedForType(type, offer)) {
    throw new Error(`offer "${offer}" is not allowed for type "${type}"`);
  }
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fieldsFor(type, offer)) shape[f.key] = zodForField(f);
  return z.object(shape).strict();
}
