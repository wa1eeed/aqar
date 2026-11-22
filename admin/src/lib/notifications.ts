import type { NotificationRow } from './types';

/** Icon + pill colour per event family (design/screenshots/a-notifications.png). */
export function notificationLook(eventKey: string): { pill: string; icon: string } {
  if (eventKey.startsWith('lead.') || eventKey.startsWith('viewing.')) return { pill: 'p-gold', icon: 'mail' };
  if (eventKey.startsWith('booking.')) return { pill: 'p-green', icon: 'check' };
  if (eventKey.startsWith('payment.')) return { pill: 'p-amber', icon: 'calc' };
  if (eventKey.startsWith('license.')) return { pill: 'p-red', icon: 'clock' };
  if (eventKey.startsWith('integration.')) return { pill: 'p-blue', icon: 'layers' };
  if (eventKey.startsWith('property.')) return { pill: 'p-green', icon: 'building' };
  return { pill: 'p-gray', icon: 'info' };
}

/** Admin links are stored as `/admin/...`; the router's basename is `/admin`. */
export function adminPath(link: string | null): string | null {
  if (!link) return null;
  if (link === '/admin') return '/';
  return link.startsWith('/admin/') ? link.slice('/admin'.length) : null;
}

export const STAFF_EVENT_LABELS: Record<string, string> = {
  'lead.created': 'طلب جديد',
  'lead.assigned': 'إسناد طلب إليّ',
  'lead.stage_changed': 'تغيّر مرحلة طلب',
  'viewing.requested': 'طلب معاينة',
  'viewing.reminder': 'تذكير بموعد معاينة',
  'property.status_changed': 'تغيّر حالة عقار',
  'booking.created': 'حجز جديد',
  'booking.confirmed': 'تأكيد حجز',
  'booking.cancelled': 'إلغاء حجز',
  'payment.paid': 'دفعة مستلمة',
  'payment.transfer_submitted': 'إيصال تحويل جديد',
  'payment.refunded': 'استرداد',
  'payment.anomaly': 'مبلغ دفع غير مطابق',
  'license.expiring': 'قرب انتهاء ترخيص',
  'license.rega_invalid': 'ترخيص غير صالح',
  'integration.health_changed': 'حالة التكاملات',
  'email.bounced': 'تعذّر تسليم بريد',
  'security.new_login': 'تسجيل دخول جديد',
  'staff.broadcast': 'تنبيهات الفريق',
};

const PREF_KEY = 'nx_admin_alerts';
export function alertPrefs(): { desktop: boolean; sound: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { desktop?: boolean; sound?: boolean };
    return { desktop: !!v.desktop, sound: !!v.sound };
  } catch {
    return { desktop: false, sound: false };
  }
}
export function setAlertPrefs(v: { desktop: boolean; sound: boolean }): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

/** Desktop notification when the tab is hidden, and a short tone for high priority (both opt-in). */
export function alertUser(n: Pick<NotificationRow, 'title' | 'body' | 'priority'>): void {
  const p = alertPrefs();
  if (p.desktop && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(n.title, { body: n.body, tag: 'nx-admin', lang: 'ar', dir: 'rtl' });
    } catch {
      /* unsupported */
    }
  }
  if (p.sound && n.priority === 'high') {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.35);
    } catch {
      /* autoplay blocked */
    }
  }
}
