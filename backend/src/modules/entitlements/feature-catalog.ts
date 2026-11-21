/**
 * سجلّ الميزات (Feature Catalog) — طبقة "القدرات" (Capabilities): ما يستطيع الكود فعله.
 * المصدر هنا في الكود؛ يُبذر إلى جدول Feature. لا تُخترع ميزة من لوحة الباقات —
 * تُفعَّل فقط ميزات مبنية برمجياً. القيم في PlanEntitlement:
 *   boolean → true/false، limit → عدد أو null (بلا حدّ)، metered → حصّة عددية.
 */
export type FeatureType = 'boolean' | 'limit' | 'metered';

export interface FeatureDef {
  key: string;
  nameAr: string;
  type: FeatureType;
  category: string;
  description?: string;
}

export const FEATURE_CATALOG: FeatureDef[] = [
  { key: 'properties.max', nameAr: 'حدّ عدد العقارات', type: 'limit', category: 'listings' },
  { key: 'staff.max', nameAr: 'حدّ عدد الموظفين', type: 'limit', category: 'team' },
  { key: 'savedSearches.enabled', nameAr: 'عمليات البحث المحفوظة', type: 'boolean', category: 'crm' },
  { key: 'onlinePayments.enabled', nameAr: 'الدفع الإلكتروني', type: 'boolean', category: 'payments' },
  { key: 'bankTransfer.enabled', nameAr: 'التحويل البنكي', type: 'boolean', category: 'payments' },
  { key: 'auctions.enabled', nameAr: 'المزادات', type: 'boolean', category: 'advanced' },
  { key: 'customDomain.enabled', nameAr: 'نطاق مخصّص', type: 'boolean', category: 'branding' },
  { key: 'seo.advanced', nameAr: 'أدوات تحسين الظهور المتقدّمة', type: 'boolean', category: 'seo' },
  { key: 'api.enabled', nameAr: 'الوصول البرمجي (API)', type: 'boolean', category: 'integrations' },
  { key: 'api.calls', nameAr: 'طلبات API الشهرية', type: 'metered', category: 'integrations' },
];

export const FEATURE_KEYS = new Set(FEATURE_CATALOG.map((f) => f.key));

export function isKnownFeature(key: string): boolean {
  return FEATURE_KEYS.has(key);
}
