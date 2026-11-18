import { ALL, type FieldDef, type Offer, type CityDef } from './types.js';
import { schemaData } from './data.js';

function match(list: typeof ALL | string[], v: string): boolean {
  return list === ALL || list.indexOf(v) !== -1;
}

/** الحقول التي تظهر لنوع عقار وعرض معيّنين. */
export function fieldsFor(type: string, offer: string): FieldDef[] {
  return schemaData.fields.filter((f) => match(f.types, type) && match(f.offers, offer));
}

/** إيجاد تعريف حقل بمفتاحه. */
export function field(key: string): FieldDef | null {
  return schemaData.fields.find((f) => f.key === key) ?? null;
}

/** الحالات المسموحة لعرض معيّن. */
export function statusesFor(offer: Offer): string[] {
  return Object.keys(schemaData.statuses).filter(
    (s) => schemaData.statuses[s].offers.indexOf(offer) !== -1,
  );
}

/** إيجاد مدينة بمعرّفها. */
export function city(id: string): CityDef | null {
  return schemaData.cities.find((c) => c.id === id) ?? null;
}

/** هل الحالة "منتهية" (تم البيع / تم التأجير). */
export function isClosed(status: string): boolean {
  return schemaData.closedStatuses.indexOf(status) !== -1;
}
