import { z } from 'zod';
import { plainText } from '../../../common/security/zod-helpers';
import { EVENT_CATALOG } from '../../events/event-catalog';
import { timeHHMM } from './common';

const channels = z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() }).strict();

const defaultChannels = Object.fromEntries(EVENT_CATALOG.map((e) => [e.key, e.defaults]));
const eventKey = z.string().refine((k) => k in defaultChannels, 'unknown_event');

export const EMAIL_TEMPLATE_KEYS = [
  'otp',
  'lead-new-staff',
  'lead-assigned',
  'viewing-confirmed',
  'viewing-reminder',
  'booking-created',
  'booking-confirmed',
  'booking-expired',
  'booking-cancelled',
  'booking-completed',
  'payment-receipt',
  'payment-failed',
  'transfer-instructions',
  'transfer-submitted-staff',
  'transfer-approved',
  'transfer-rejected',
  'refund',
  'license-expiring',
  'saved-search-digest',
  'price-drop',
  'staff-invite',
  'password-reset',
  'security-new-login',
  'integration-down',
] as const;

export const notificationsSettings = z
  .object({
    leadRouting: z.enum(['round_robin', 'manager_only']).default('round_robin'),
    quietHours: z
      .object({ enabled: z.boolean().default(true), start: timeHHMM.default('22:00'), end: timeHHMM.default('07:00') })
      .strict()
      .default({}),
    /** Default channels per event (docs/06 §3); recipients can override in their preferences. */
    channels: z
      .record(eventKey, channels)
      .default({})
      .transform((v) => ({ ...defaultChannels, ...v })),
    senderName: plainText(80).default(''),
    templateOverrides: z
      .record(
        z.enum(EMAIL_TEMPLATE_KEYS),
        z.object({ subject: plainText(150).optional(), intro: plainText(1000).optional() }).strict(),
      )
      .default({}),
  })
  .strict();
