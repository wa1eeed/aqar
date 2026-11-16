import {
  ALL,
  cities,
  closedStatuses,
  fields,
  statuses,
  types,
  STATUS_KEYS,
  type All,
  type CityDef,
  type FieldDef,
  type OfferKey,
  type StatusKey,
  type TypeKey,
} from './data';

function match<T extends string>(list: All | readonly T[], value: string): boolean {
  return list === ALL || (list as readonly string[]).indexOf(value) !== -1;
}

/** Fields that apply to a property of `type` offered as `offer` (same semantics as the frontend). */
export function fieldsFor(type: string, offer: string): FieldDef[] {
  return fields.filter((f) => match(f.types, type) && match(f.offers, offer));
}

export function field(key: string): FieldDef | null {
  return fields.find((f) => f.key === key) ?? null;
}

/** Statuses allowed for an offer, in declaration order. */
export function statusesFor(offer: string): StatusKey[] {
  return STATUS_KEYS.filter((s) => (statuses[s].offers as string[]).indexOf(offer) !== -1);
}

export function city(id: string): CityDef | null {
  return cities.find((c) => c.id === id) ?? null;
}

export function isClosed(status: string): boolean {
  return (closedStatuses as string[]).indexOf(status) !== -1;
}

export function isTypeKey(value: string): value is TypeKey {
  return Object.prototype.hasOwnProperty.call(types, value);
}

/** Whether `type` may be listed with `offer` (types[type].offers). */
export function isOfferAllowedForType(type: string, offer: string): offer is OfferKey {
  return isTypeKey(type) && (types[type].offers as string[]).indexOf(offer) !== -1;
}
