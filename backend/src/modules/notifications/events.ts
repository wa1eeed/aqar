// كتالوج الأحداث والقنوات الافتراضية (docs/06 §3). المفاتيح نهائية.

export interface Channels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export const DEFAULT_CHANNELS: Record<string, Channels> = {
  'lead.created': { inApp: true, email: true, sms: false },
  'lead.assigned': { inApp: true, email: true, sms: false },
  'lead.stage_changed': { inApp: true, email: false, sms: false },
  'viewing.requested': { inApp: true, email: true, sms: false },
  'viewing.confirmed': { inApp: true, email: true, sms: true },
  'viewing.cancelled': { inApp: true, email: true, sms: false },
  'property.status_changed': { inApp: true, email: false, sms: false },
  'property.price_dropped': { inApp: true, email: true, sms: false },
  'property.matched_saved_search': { inApp: true, email: true, sms: false },
  'staff.broadcast': { inApp: true, email: false, sms: false },
};

// أحداث معاملاتية لا يمكن للعميل إيقافها (docs/06 §3).
const TRANSACTIONAL_PREFIX = new Set(['payment', 'booking', 'security']);

export function isTransactional(eventKey: string): boolean {
  return TRANSACTIONAL_PREFIX.has(eventKey.split('.')[0]);
}

export function defaultChannels(eventKey: string): Channels {
  return DEFAULT_CHANNELS[eventKey] ?? { inApp: true, email: false, sms: false };
}
