import type { z } from 'zod';
import { generalSchema } from './general.schema.js';
import { brandingSchema } from './branding.schema.js';
import { contactSchema } from './contact.schema.js';
import { licensingSchema } from './licensing.schema.js';
import { bookingSchema } from './booking.schema.js';
import { paymentsSchema } from './payments.schema.js';
import { bankTransferSchema } from './bank-transfer.schema.js';
import { notificationsSchema } from './notifications.schema.js';
import { mapsSchema } from './maps.schema.js';
import { locationsSchema } from './locations.schema.js';
import { featuresSchema } from './features.schema.js';
import { legalSchema } from './legal.schema.js';
import { seoSchema } from './seo.schema.js';

/** سجلّ أقسام الإعدادات. المفاتيح تطابق SettingsSection.key في مخطّط Prisma (docs/01). */
export const SETTINGS_SCHEMAS = {
  general: generalSchema,
  branding: brandingSchema,
  contact: contactSchema,
  licensing: licensingSchema,
  booking: bookingSchema,
  payments: paymentsSchema,
  bank_transfer: bankTransferSchema,
  notifications: notificationsSchema,
  maps: mapsSchema,
  locations: locationsSchema,
  features: featuresSchema,
  legal: legalSchema,
  seo: seoSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

export type SettingsSectionKey = keyof typeof SETTINGS_SCHEMAS;

export const SETTINGS_SECTION_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsSectionKey[];

export function isSettingsSectionKey(key: string): key is SettingsSectionKey {
  return key in SETTINGS_SCHEMAS;
}

/** القيمة الافتراضية لقسم (كل الحقول لها defaults، فيكفي parse لكائن فارغ). */
export function defaultFor(key: SettingsSectionKey): unknown {
  return SETTINGS_SCHEMAS[key].parse({});
}

/** كل الأقسام بقيمها الافتراضية — يستخدمها البذر (seed). */
export function allDefaults(): Record<SettingsSectionKey, unknown> {
  const out = {} as Record<SettingsSectionKey, unknown>;
  for (const key of SETTINGS_SECTION_KEYS) out[key] = defaultFor(key);
  return out;
}

export * from './general.schema.js';
export * from './branding.schema.js';
export * from './contact.schema.js';
export * from './licensing.schema.js';
export * from './booking.schema.js';
export * from './payments.schema.js';
export * from './bank-transfer.schema.js';
export * from './notifications.schema.js';
export * from './maps.schema.js';
export * from './locations.schema.js';
export * from './features.schema.js';
export * from './legal.schema.js';
export * from './seo.schema.js';
