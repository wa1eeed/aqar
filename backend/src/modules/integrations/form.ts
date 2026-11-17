import type { ZodTypeAny } from 'zod';
import type { ProviderDefinition, UiHint } from './types';

export interface FormField {
  key: string;
  labelAr: string;
  helpAr?: string;
  placeholder?: string;
  type: NonNullable<UiHint['type']>;
  required: boolean;
  options?: Array<{ value: string; labelAr: string }>;
}

/** Peel optional/default/effects wrappers to the underlying zod type. */
function unwrap(t: ZodTypeAny): { inner: ZodTypeAny; optional: boolean } {
  let inner = t;
  let optional = false;
  for (;;) {
    const name = inner._def.typeName as string;
    if (name === 'ZodOptional' || name === 'ZodNullable' || name === 'ZodDefault') {
      optional = true;
      inner = inner._def.innerType;
    } else if (name === 'ZodEffects') inner = inner._def.schema;
    else if (name === 'ZodPipeline') inner = inner._def.in;
    else if (name === 'ZodUnion') {
      // `'' | X` → optional X
      const opts = inner._def.options as ZodTypeAny[];
      const rest = opts.filter((o) => !(o._def.typeName === 'ZodLiteral' && o._def.value === ''));
      if (rest.length !== opts.length) optional = true;
      inner = rest[0] ?? opts[0]!;
    } else break;
  }
  return { inner, optional };
}

function fieldsOf(schema: ZodTypeAny, hints: Record<string, UiHint>, secret: boolean): FormField[] {
  const shape = (unwrap(schema).inner._def.shape?.() ?? {}) as Record<string, ZodTypeAny>;
  return Object.entries(shape).map(([key, t]) => {
    const { inner, optional } = unwrap(t);
    const hint = hints[key] ?? { labelAr: key };
    const typeName = inner._def.typeName as string;
    let type: FormField['type'] = hint.type ?? 'text';
    let options: FormField['options'];
    if (typeName === 'ZodNumber') type = 'number';
    else if (typeName === 'ZodBoolean') type = 'boolean';
    else if (typeName === 'ZodEnum') {
      type = 'select';
      options = (inner._def.values as string[]).map((v) => ({ value: v, labelAr: hint.optionsAr?.[v] ?? v }));
    } else if (typeName === 'ZodArray' && inner._def.type._def.typeName === 'ZodEnum') {
      type = 'multiselect';
      options = (inner._def.type._def.values as string[]).map((v) => ({ value: v, labelAr: hint.optionsAr?.[v] ?? v }));
    }
    return {
      key,
      labelAr: hint.labelAr,
      ...(hint.helpAr ? { helpAr: hint.helpAr } : {}),
      ...(hint.placeholder ? { placeholder: hint.placeholder } : {}),
      type: secret && type !== 'textarea' ? 'text' : type,
      required: !optional && !secret,
      ...(options ? { options } : {}),
    };
  });
}

/** docs/05 §2: the admin integration screen is generated from configSchema + secretsSchema + uiHints. */
export function formFor(def: ProviderDefinition) {
  return {
    config: fieldsOf(def.configSchema, def.uiHints, false),
    secrets: fieldsOf(def.secretsSchema, def.uiHints, true),
  };
}
