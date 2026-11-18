/**
 * مفاتيح الصلاحيات والأدوار النظامية (docs/03 §3).
 * القيود "own" / "assigned only" تُفرض على مستوى الصفوف في الخدمات، لا هنا.
 */
export const ALL_PERMISSIONS = [
  'dashboard.view',
  'properties.view',
  'properties.create',
  'properties.edit',
  'properties.status',
  'properties.publish',
  'properties.delete',
  'leads.view',
  'leads.manage',
  'leads.assign',
  'viewings.manage',
  'customers.view',
  'customers.manage',
  'bookings.view',
  'bookings.manage',
  'payments.view',
  'payments.review',
  'payments.refund',
  'notifications.broadcast',
  'reports.view',
  'seo.manage',
  'settings.general',
  'settings.branding',
  'settings.contact',
  'settings.legal',
  'settings.licensing',
  'settings.booking',
  'settings.payments',
  'settings.notifications',
  'settings.maps',
  'settings.features',
  'settings.locations',
  'integrations.manage',
  'staff.manage',
  'roles.manage',
  'audit.view',
  'auctions.manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface SystemRoleDef {
  key: string;
  nameAr: string;
  permissions: Permission[];
}

const all: Permission[] = [...ALL_PERMISSIONS];

export const SYSTEM_ROLES: SystemRoleDef[] = [
  { key: 'owner', nameAr: 'المالك', permissions: all },
  {
    key: 'admin',
    nameAr: 'مدير النظام',
    // كل الصلاحيات عدا استرداد المدفوعات (payments.refund)
    permissions: all.filter((p) => p !== 'payments.refund'),
  },
  {
    key: 'sales_manager',
    nameAr: 'مدير المبيعات',
    permissions: [
      'dashboard.view',
      'properties.view',
      'properties.create',
      'properties.edit',
      'properties.status',
      'properties.publish',
      'leads.view',
      'leads.manage',
      'leads.assign',
      'viewings.manage',
      'customers.view',
      'bookings.view',
      'bookings.manage',
      'notifications.broadcast',
      'reports.view',
      'auctions.manage',
    ],
  },
  {
    key: 'agent',
    nameAr: 'مستشار عقاري',
    permissions: [
      'dashboard.view',
      'properties.view',
      'properties.create',
      'properties.edit',
      'properties.status',
      'leads.view',
      'leads.manage',
      'viewings.manage',
      'customers.view',
      'bookings.view',
    ],
  },
  {
    key: 'finance',
    nameAr: 'المالية',
    permissions: [
      'dashboard.view',
      'properties.view',
      'customers.view',
      'bookings.view',
      'bookings.manage',
      'payments.view',
      'payments.review',
      'payments.refund',
      'reports.view',
      'settings.booking',
      'settings.payments',
    ],
  },
  {
    key: 'content_editor',
    nameAr: 'محرّر المحتوى',
    permissions: [
      'dashboard.view',
      'properties.view',
      'properties.create',
      'properties.edit',
      'properties.publish',
      'seo.manage',
      'settings.general',
      'settings.branding',
      'settings.contact',
      'settings.legal',
    ],
  },
];
