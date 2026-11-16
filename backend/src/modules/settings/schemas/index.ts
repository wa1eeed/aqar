import type { z } from 'zod';
import type { Permission } from '../../../common/auth/permissions';
import { bankTransferSettings } from './bank-transfer';
import { bookingSettings } from './booking';
import { brandingSettings } from './branding';
import { contactSettings } from './contact';
import { featuresSettings } from './features';
import { generalSettings } from './general';
import { legalSettings } from './legal';
import { licensingSettings } from './licensing';
import { locationsSettings } from './locations';
import { mapsSettings } from './maps';
import { notificationsSettings } from './notifications';
import { paymentsSettings } from './payments';
import { seoSettings } from './seo';

/** Section key → zod schema and the permission that may edit it (docs/07 §10, docs/03 §3). */
export const SETTINGS_SECTIONS = {
  general: { schema: generalSettings, permission: 'settings.general' },
  branding: { schema: brandingSettings, permission: 'settings.branding' },
  contact: { schema: contactSettings, permission: 'settings.contact' },
  licensing: { schema: licensingSettings, permission: 'settings.licensing' },
  booking: { schema: bookingSettings, permission: 'settings.booking' },
  payments: { schema: paymentsSettings, permission: 'settings.payments' },
  bank_transfer: { schema: bankTransferSettings, permission: 'settings.payments' },
  notifications: { schema: notificationsSettings, permission: 'settings.notifications' },
  maps: { schema: mapsSettings, permission: 'settings.maps' },
  locations: { schema: locationsSettings, permission: 'settings.locations' },
  features: { schema: featuresSettings, permission: 'settings.features' },
  legal: { schema: legalSettings, permission: 'settings.legal' },
  seo: { schema: seoSettings, permission: 'seo.manage' },
} as const satisfies Record<string, { schema: z.ZodTypeAny; permission: Permission }>;

export type SettingsKey = keyof typeof SETTINGS_SECTIONS;
export type SettingsValue<K extends SettingsKey> = z.output<(typeof SETTINGS_SECTIONS)[K]['schema']>;
export const SETTINGS_KEYS = Object.keys(SETTINGS_SECTIONS) as SettingsKey[];

export function isSettingsKey(key: string): key is SettingsKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SECTIONS, key);
}

/** Full default value of a section. */
export function defaultsFor<K extends SettingsKey>(key: K): SettingsValue<K> {
  return SETTINGS_SECTIONS[key].schema.parse({}) as SettingsValue<K>;
}
