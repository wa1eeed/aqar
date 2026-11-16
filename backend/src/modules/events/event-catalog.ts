/**
 * Domain events catalog (docs/06 §3). Keys are final. `defaults` are the default channels;
 * `locked` events cannot be disabled by customers («إشعار أساسي لا يمكن إيقافه»).
 */
export interface EventDef {
  key: string;
  defaults: { inApp: boolean; email: boolean; sms: boolean };
  locked?: boolean;
}

const ch = (inApp: boolean, email: boolean, sms = false) => ({ inApp, email, sms });

export const EVENT_CATALOG: EventDef[] = [
  { key: 'lead.created', defaults: ch(true, true) },
  { key: 'lead.assigned', defaults: ch(true, true) },
  { key: 'lead.stage_changed', defaults: ch(true, false) },
  { key: 'viewing.requested', defaults: ch(true, true) },
  { key: 'viewing.confirmed', defaults: ch(true, true, true) },
  { key: 'viewing.reminder', defaults: ch(true, true, true) },
  { key: 'booking.created', defaults: ch(true, false), locked: true },
  { key: 'booking.confirmed', defaults: ch(true, true), locked: true },
  { key: 'booking.expired', defaults: ch(true, true), locked: true },
  { key: 'booking.cancelled', defaults: ch(true, true), locked: true },
  { key: 'booking.completed', defaults: ch(true, true), locked: true },
  { key: 'payment.paid', defaults: ch(true, true), locked: true },
  { key: 'payment.failed', defaults: ch(true, true), locked: true },
  { key: 'payment.transfer_submitted', defaults: ch(true, true), locked: true },
  { key: 'payment.transfer_approved', defaults: ch(true, true), locked: true },
  { key: 'payment.transfer_rejected', defaults: ch(true, true), locked: true },
  { key: 'payment.refunded', defaults: ch(true, true), locked: true },
  { key: 'payment.anomaly', defaults: ch(true, true), locked: true },
  { key: 'property.status_changed', defaults: ch(true, false) },
  { key: 'property.price_dropped', defaults: ch(true, true) },
  { key: 'property.matched_saved_search', defaults: ch(true, true) },
  { key: 'license.expiring', defaults: ch(true, true) },
  { key: 'license.rega_invalid', defaults: ch(true, true) },
  { key: 'integration.health_changed', defaults: ch(true, true) },
  { key: 'email.bounced', defaults: ch(true, false) },
  { key: 'security.new_login', defaults: ch(false, true), locked: true },
  { key: 'security.session_revoked', defaults: ch(false, true), locked: true },
  { key: 'staff.broadcast', defaults: ch(true, false) },
];

export const EVENT_KEYS = EVENT_CATALOG.map((e) => e.key);
