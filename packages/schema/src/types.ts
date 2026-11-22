/**
 * عقار أونلاين — أنواع نموذج البيانات المشترك.
 * هذه الأنواع هي العقد بين الواجهة والـ backend.
 */

export const ALL = '*' as const;
export type AllMarker = typeof ALL;

export type Offer = 'sale' | 'rent' | 'investment';
export type FieldKind = 'number' | 'money' | 'select' | 'bool' | 'text' | 'date';

export interface OfferDef {
  label: string;
  short: string;
}

export interface StatusDef {
  label: string;
  offers: Offer[];
}

export interface TypeDef {
  label: string;
  plural: string;
  cat: string;
  icon: string;
  offers: Offer[];
}

export interface CityDef {
  id: string;
  label: string;
  center: [number, number];
  districts: string[];
}

export interface FieldGroupDef {
  id: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  kind: FieldKind;
  /** '*' = كل الأنواع، أو قائمة أنواع العقار التي يظهر فيها الحقل */
  types: AllMarker | string[];
  /** '*' = كل العروض، أو قائمة العروض التي يظهر فيها الحقل */
  offers: AllMarker | Offer[];
  unit?: string;
  icon?: string;
  /** يظهر في شريط المعلومات السريعة أعلى صفحة العقار */
  key_fact?: boolean;
  /** يمكن استخدامه في الفلاتر */
  filter?: boolean;
  required?: boolean;
  zeroLabel?: string;
  options?: Record<string, string>;
}

export interface NearbyDef {
  label: string;
  icon: string;
  osm: string;
}

export interface SchemaData {
  offers: Record<Offer, OfferDef>;
  statuses: Record<string, StatusDef>;
  closedStatuses: string[];
  categories: Record<string, string>;
  types: Record<string, TypeDef>;
  rentPeriods: Record<string, string>;
  cities: CityDef[];
  fieldGroups: FieldGroupDef[];
  fields: FieldDef[];
  nearby: Record<string, NearbyDef>;
}
