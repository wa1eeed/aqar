/**
 * CRM labels shared by the backend (notification texts), the admin and the customer pages
 * (docs/07 §4–5, labels from design/screenshots/a-leads.png). Not part of the property schema.
 */
export const LEAD_STAGES = ['new', 'contacted', 'viewing', 'negotiation', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const leadStages: Record<LeadStage, { label: string; pill: string }> = {
  new: { label: 'جديد', pill: 'p-gold' },
  contacted: { label: 'تم التواصل', pill: 'p-blue' },
  viewing: { label: 'معاينة', pill: 'p-purple' },
  negotiation: { label: 'تفاوض', pill: 'p-amber' },
  won: { label: 'تمت الصفقة', pill: 'p-green' },
  lost: { label: 'لم تتم', pill: 'p-red' },
};

export const LEAD_TYPES = ['viewing', 'waitlist', 'buy', 'rent', 'list', 'invest', 'manage', 'contact'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const leadTypes: Record<LeadType, string> = {
  viewing: 'طلب معاينة',
  waitlist: 'قائمة انتظار',
  buy: 'شراء',
  rent: 'إيجار',
  list: 'عرض عقار',
  invest: 'استثمار',
  manage: 'إدارة أملاك',
  contact: 'تواصل',
};

export const LEAD_SOURCES = ['website', 'whatsapp', 'phone', 'walk_in', 'admin'] as const;
export const leadSources: Record<(typeof LEAD_SOURCES)[number], string> = {
  website: 'الموقع',
  whatsapp: 'واتساب',
  phone: 'اتصال',
  walk_in: 'زيارة المكتب',
  admin: 'إدخال يدوي',
};

export const VIEWING_STATUSES = ['requested', 'confirmed', 'completed', 'no_show', 'cancelled'] as const;
export const viewingStatuses: Record<(typeof VIEWING_STATUSES)[number], { label: string; pill: string }> = {
  requested: { label: 'مطلوب', pill: 'p-blue' },
  confirmed: { label: 'مؤكد', pill: 'p-green' },
  completed: { label: 'تمت', pill: 'p-gray' },
  no_show: { label: 'لم يحضر', pill: 'p-red' },
  cancelled: { label: 'ملغي', pill: 'p-gray' },
};

/** Viewing time windows of the property page modal, Riyadh time (docs/QUESTIONS #30). */
export const viewingSlots = {
  morning: { label: 'صباحاً', hour: 10 },
  afternoon: { label: 'عصراً', hour: 16 },
  evening: { label: 'مساءً', hour: 19 },
} as const;
