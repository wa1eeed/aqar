/**
 * Booking amounts and payment-method availability (docs/04 §2). Pure functions: no I/O, so every rule
 * (fixed/percent deposit, min/max clamp, rent periods, per-property override, method filters) is unit
 * tested in isolation. All money is halalas (bigint).
 */
import type { PaymentMethod, PaymentType, PropertyOffer, RentPeriod } from '@prisma/client';
import { type Policy, policySchema } from '../settings/schemas/booking';

export interface BookingSettingsLike {
  enabled: boolean;
  allowedOffers: readonly PropertyOffer[];
  policies: Record<PropertyOffer, Policy>;
  holdMinutesOnline: number;
  holdHoursTransfer: number;
}
export interface PaymentsSettingsLike {
  moyasar: { enabled: boolean; labelAr: string };
  bank_transfer: { enabled: boolean; labelAr: string };
  rize: { enabled: boolean; labelAr: string; onlyRentPeriods: readonly RentPeriod[] };
}
export interface PropertyLike {
  offer: PropertyOffer;
  price: bigint;
  rentPeriod: RentPeriod | null;
  status: string;
  visibility: string;
  bookingEnabled: boolean;
  deletedAt: Date | null;
  paymentPolicy: unknown;
}
/** Which integrations are ready right now (enabled + credentials + healthy circuit). */
export type ReadyMethods = Record<PaymentMethod, boolean>;

/** A valid per-property override wins over the offer's policy; an invalid stored value is ignored. */
export function resolvePolicy(settings: BookingSettingsLike, p: Pick<PropertyLike, 'offer' | 'paymentPolicy'>): Policy {
  if (p.paymentPolicy) {
    const parsed = policySchema.safeParse(p.paymentPolicy);
    if (parsed.success) return parsed.data;
  }
  return settings.policies[p.offer];
}

/** Full amount = the listed price (for rent: one rent period, which is how the price is stored). */
export function fullAmount(p: Pick<PropertyLike, 'price'>): bigint {
  return p.price;
}

/** Deposit: fixed or percent of the full amount, clamped to [min, max], never above the full amount. */
export function depositAmount(policy: Policy, full: bigint): bigint {
  const d = policy.deposit;
  // percent with 2 decimals → integer math on hundredths of a percent.
  let amount = d.mode === 'fixed' ? BigInt(d.fixedAmount) : (full * BigInt(Math.round(d.percent * 100))) / 10_000n;
  if (d.min !== null && amount < BigInt(d.min)) amount = BigInt(d.min);
  if (d.max !== null && amount > BigInt(d.max)) amount = BigInt(d.max);
  return amount > full ? full : amount;
}

export function amountFor(policy: Policy, p: Pick<PropertyLike, 'price'>, type: PaymentType): bigint {
  const full = fullAmount(p);
  return type === 'full' ? full : depositAmount(policy, full);
}

export type Unavailable = 'BOOKING_DISABLED' | 'OFFER_NOT_BOOKABLE' | 'PROPERTY_NOT_BOOKABLE' | 'PROPERTY_UNAVAILABLE';

/** Why a property cannot be booked (null = bookable). Active bookings are checked by the service. */
export function unavailableReason(
  settings: BookingSettingsLike,
  bookingFeature: boolean,
  p: PropertyLike,
): Unavailable | null {
  if (!settings.enabled || !bookingFeature) return 'BOOKING_DISABLED';
  if (!settings.allowedOffers.includes(p.offer)) return 'OFFER_NOT_BOOKABLE';
  if (!p.bookingEnabled || p.visibility !== 'published' || p.deletedAt) return 'PROPERTY_NOT_BOOKABLE';
  if (p.status !== 'available') return 'PROPERTY_UNAVAILABLE';
  return null;
}

/**
 * A method is offered only if enabled in settings.payments, its integration is ready, and the policy
 * lists it for the payment type (docs/04 §2). Rize: rent only, allowed rent periods, full payment.
 */
export function methodsFor(
  policy: Policy,
  type: PaymentType,
  payments: PaymentsSettingsLike,
  ready: ReadyMethods,
  p: Pick<PropertyLike, 'offer' | 'rentPeriod'>,
): PaymentMethod[] {
  return policy.methods[type].filter((m) => {
    if (!payments[m].enabled || !ready[m]) return false;
    if (m === 'rize') {
      return (
        p.offer === 'rent' && type === 'full' && !!p.rentPeriod && payments.rize.onlyRentPeriods.includes(p.rentPeriod)
      );
    }
    return true;
  });
}

/** Payment types the customer can choose = policy types that have at least one available method. */
export function paymentTypesFor(
  policy: Policy,
  payments: PaymentsSettingsLike,
  ready: ReadyMethods,
  p: Pick<PropertyLike, 'offer' | 'rentPeriod'>,
): PaymentType[] {
  return policy.paymentTypes.filter((t) => methodsFor(policy, t, payments, ready, p).length > 0);
}

/** Hold length: online payments in minutes, bank transfer in hours (docs/04 §4). */
export function holdMs(settings: BookingSettingsLike, method: PaymentMethod): number {
  return method === 'bank_transfer' ? settings.holdHoursTransfer * 3_600_000 : settings.holdMinutesOnline * 60_000;
}
