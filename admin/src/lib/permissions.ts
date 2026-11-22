/** Arabic labels for permission keys, grouped by area (docs/03 §3, docs/07 §12). */
export const PERMISSION_GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  {
    label: 'الرئيسية والتقارير',
    items: [
      ['dashboard.view', 'عرض لوحة المؤشرات'],
      ['reports.view', 'عرض التقارير'],
      ['audit.view', 'سجل العمليات'],
    ],
  },
  {
    label: 'العقارات',
    items: [
      ['properties.view', 'عرض العقارات'],
      ['properties.create', 'إضافة عقار'],
      ['properties.edit', 'تعديل العقارات'],
      ['properties.status', 'تغيير حالة العقار'],
      ['properties.publish', 'نشر وإلغاء النشر'],
      ['properties.delete', 'حذف العقارات'],
    ],
  },
  {
    label: 'الطلبات والعملاء',
    items: [
      ['leads.view', 'عرض الطلبات'],
      ['leads.manage', 'إدارة الطلبات'],
      ['leads.assign', 'إسناد الطلبات'],
      ['viewings.manage', 'إدارة المعاينات'],
      ['customers.view', 'عرض العملاء'],
      ['customers.manage', 'حظر العملاء'],
    ],
  },
  {
    label: 'الحجوزات والمدفوعات',
    items: [
      ['bookings.view', 'عرض الحجوزات'],
      ['bookings.manage', 'إدارة الحجوزات'],
      ['payments.view', 'عرض المدفوعات'],
      ['payments.review', 'مراجعة التحويلات'],
      ['payments.refund', 'استرداد المبالغ'],
    ],
  },
  {
    label: 'الإعدادات',
    items: [
      ['settings.general', 'الإعدادات العامة'],
      ['settings.branding', 'الهوية والمظهر'],
      ['settings.contact', 'بيانات التواصل'],
      ['settings.legal', 'الصفحات القانونية'],
      ['settings.licensing', 'التراخيص'],
      ['settings.booking', 'إعدادات الحجز'],
      ['settings.payments', 'طرق الدفع والحسابات البنكية'],
      ['settings.notifications', 'الإشعارات'],
      ['settings.maps', 'الخرائط'],
      ['settings.features', 'المزايا'],
      ['settings.locations', 'المدن والأحياء'],
    ],
  },
  {
    label: 'الإدارة',
    items: [
      ['integrations.manage', 'التكاملات'],
      ['seo.manage', 'تحسين الظهور (SEO)'],
      ['notifications.broadcast', 'تنبيهات الفريق'],
      ['staff.manage', 'إدارة الفريق'],
      ['roles.manage', 'إدارة الأدوار'],
      ['auctions.manage', 'المزادات'],
    ],
  },
];
