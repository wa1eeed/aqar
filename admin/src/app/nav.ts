/** Sidebar navigation, in the order of docs/07 §1. `phase` = implementation phase (docs/11). */
export interface NavItem {
  to: string;
  icon: string;
  label: string;
  /** Required permission; null = every staff member. */
  permission: string | null;
  group: 'main' | 'operations' | 'growth';
  phase: number;
  /** Hidden unless the feature flag is on. */
  flag?: 'auctions';
}

export const NAV: NavItem[] = [
  { to: '/', icon: 'grid', label: 'الرئيسية', permission: 'dashboard.view', group: 'main', phase: 4 },
  { to: '/properties', icon: 'building', label: 'العقارات', permission: 'properties.view', group: 'main', phase: 3 },
  { to: '/leads', icon: 'mail', label: 'الطلبات', permission: 'leads.view', group: 'main', phase: 4 },
  { to: '/viewings', icon: 'calendar', label: 'المعاينات', permission: 'viewings.manage', group: 'main', phase: 4 },
  { to: '/bookings', icon: 'key', label: 'الحجوزات', permission: 'bookings.view', group: 'operations', phase: 5 },
  { to: '/payments', icon: 'calc', label: 'المدفوعات', permission: 'payments.view', group: 'operations', phase: 5 },
  { to: '/customers', icon: 'user', label: 'العملاء', permission: 'customers.view', group: 'operations', phase: 4 },
  {
    to: '/auctions',
    icon: 'handshake',
    label: 'المزادات',
    permission: 'auctions.manage',
    group: 'operations',
    phase: 8,
    flag: 'auctions',
  },
  { to: '/reports', icon: 'chart', label: 'التقارير', permission: 'reports.view', group: 'growth', phase: 7 },
  { to: '/seo', icon: 'search', label: 'تحسين الظهور (SEO)', permission: 'seo.manage', group: 'growth', phase: 6 },
  { to: '/notifications', icon: 'bell', label: 'الإشعارات', permission: null, group: 'growth', phase: 4 },
  {
    to: '/integrations',
    icon: 'layers',
    label: 'التكاملات',
    permission: 'integrations.manage',
    group: 'growth',
    phase: 2,
  },
  { to: '/settings', icon: 'sparkle', label: 'الإعدادات', permission: 'settings.*', group: 'growth', phase: 1 },
  { to: '/staff', icon: 'shield', label: 'الفريق والصلاحيات', permission: 'staff.manage', group: 'growth', phase: 1 },
  { to: '/audit', icon: 'list', label: 'سجل العمليات', permission: 'audit.view', group: 'growth', phase: 7 },
];

export const GROUP_LABELS: Record<NavItem['group'], string | null> = {
  main: null,
  operations: 'العمليات',
  growth: 'النمو والإدارة',
};

/** Items visible to a user with `perms` (supports `settings.*` = any settings permission). */
export function visibleNav(perms: readonly string[], flags: { auctions: boolean }): NavItem[] {
  return NAV.filter((n) => {
    if (n.flag === 'auctions' && !flags.auctions) return false;
    if (n.permission === null) return true;
    if (n.permission.endsWith('.*')) {
      const prefix = n.permission.slice(0, -1);
      return perms.some((p) => p.startsWith(prefix));
    }
    return perms.includes(n.permission);
  });
}
