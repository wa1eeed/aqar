/**
 * Permission keys and the system-role matrix (docs/03 §3). Seeded into `Role`; system roles are not
 * deletable and their permissions are read-only. "own"/"assigned only" rows are granted here and
 * narrowed by row-level scopes in services (AccessScopeService, Phase 1).
 */
export const PERMISSIONS = [
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

export type Permission = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLE_KEYS = ['owner', 'admin', 'sales_manager', 'agent', 'finance', 'content_editor'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export interface SystemRoleDef {
  key: SystemRoleKey;
  nameAr: string;
  permissions: Permission[];
  /** TOTP 2FA is mandatory for these roles (docs/03 §1). */
  requires2fa: boolean;
  /** Row-level scope applied on top of the permissions. */
  scope: 'all' | 'own';
}

const ALL: Permission[] = [...PERMISSIONS];

export const SYSTEM_ROLES: SystemRoleDef[] = [
  { key: 'owner', nameAr: 'مالك المنشأة', permissions: ALL, requires2fa: true, scope: 'all' },
  {
    key: 'admin',
    nameAr: 'مدير النظام',
    permissions: ALL.filter((p) => p !== 'payments.refund'),
    requires2fa: true,
    scope: 'all',
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
    requires2fa: false,
    scope: 'all',
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
    requires2fa: false,
    scope: 'own',
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
    requires2fa: true,
    scope: 'all',
  },
  {
    key: 'content_editor',
    nameAr: 'محرر المحتوى',
    permissions: [
      'dashboard.view',
      'properties.view',
      'properties.create',
      'properties.edit',
      'properties.publish',
      'seo.manage',
      'settings.branding',
      'settings.legal',
    ],
    requires2fa: false,
    scope: 'all',
  },
];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
