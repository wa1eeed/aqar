import { buildSpecsZod, isClosed, isOfferAllowedForType, statusesFor } from '@nx/schema';
import type { PropertyOffer, PropertyStatus, RentPeriod } from '@prisma/client';
import type { ZodError } from 'zod';

/** docs/01 "Derived fields": lowercased title, Arabic letters kept, spaces → "-", max 80 chars. */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .trim()
      .replace(/[\s-]+/g, '-')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'property'
  );
}

export interface SpecsLike {
  area?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  roi?: number | null;
  annualIncome?: number | null;
  adLicense?: string | null;
  falLicense?: string | null;
  licenseExpiry?: string | null;
  [k: string]: unknown;
}

export interface Derived {
  annualisedPrice: bigint;
  pricePerMeter: bigint | null;
  area: number;
  bedrooms: number | null;
  bathrooms: number | null;
  roi: number | null;
  adLicenseNo: string;
  falLicenseNo: string;
  licenseExpiry: Date | null;
}

/** PropertiesService.save derived columns (docs/01). Money in halalas. */
export function derive(offer: PropertyOffer, price: bigint, rentPeriod: RentPeriod | null, specs: SpecsLike): Derived {
  const area = Math.round(Number(specs.area ?? 0));
  const annualisedPrice =
    offer === 'rent' && rentPeriod === 'monthly'
      ? price * 12n
      : offer === 'rent' && rentPeriod === 'daily'
        ? price * 365n
        : price;
  const pricePerMeter = offer !== 'rent' && area > 0 ? BigInt(Math.round(Number(price) / area)) : null;
  let roi = typeof specs.roi === 'number' ? specs.roi : null;
  if (roi === null && typeof specs.annualIncome === 'number' && price > 0n) {
    roi = Math.round((specs.annualIncome / Number(price)) * 10_000) / 100; // both in halalas
  }
  const expiry =
    typeof specs.licenseExpiry === 'string' && specs.licenseExpiry
      ? new Date(`${specs.licenseExpiry}T00:00:00Z`)
      : null;
  return {
    annualisedPrice,
    pricePerMeter,
    area,
    bedrooms: typeof specs.bedrooms === 'number' ? Math.round(specs.bedrooms) : null,
    bathrooms: typeof specs.bathrooms === 'number' ? Math.round(specs.bathrooms) : null,
    roi: roi !== null && Number.isFinite(roi) ? Math.min(roi, 999.99) : null,
    adLicenseNo: String(specs.adLicense ?? '').trim(),
    falLicenseNo: String(specs.falLicense ?? '').trim(),
    licenseExpiry: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
  };
}

/**
 * Specs validation. Drafts may be incomplete (licence numbers are often added last), so required
 * fields are relaxed; publishing re-validates strictly. Unknown keys are always rejected.
 */
export function validateSpecs(
  type: string,
  offer: string,
  specs: unknown,
  mode: 'draft' | 'publish',
): { ok: true; value: SpecsLike } | { ok: false; error: ZodError } {
  const schema = buildSpecsZod(type, offer);
  const parsed = (mode === 'draft' ? schema.partial() : schema).safeParse(specs ?? {});
  return parsed.success ? { ok: true, value: parsed.data as SpecsLike } : { ok: false, error: parsed.error };
}

export { isOfferAllowedForType };

export function statusAllowed(offer: string, status: string): status is PropertyStatus {
  return statusesFor(offer).includes(status as never);
}

export type PublishProblem = 'license_missing' | 'license_expired' | 'specs_incomplete' | 'no_photos' | 'deleted';

/** docs/07 §3: publish is blocked when the licence is empty or expired. */
export function publishProblems(p: {
  type: string;
  offer: string;
  specs: unknown;
  adLicenseNo: string;
  falLicenseNo: string;
  licenseExpiry: Date | null;
  readyPhotos: number;
  deletedAt: Date | null;
}): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (p.deletedAt) problems.push('deleted');
  if (!p.adLicenseNo || !p.falLicenseNo) problems.push('license_missing');
  if (p.licenseExpiry && p.licenseExpiry.getTime() < Date.now()) problems.push('license_expired');
  if (!validateSpecs(p.type, p.offer, p.specs, 'publish').ok) problems.push('specs_incomplete');
  if (p.readyPhotos < 1) problems.push('no_photos');
  return problems;
}

export const PUBLISH_MESSAGES: Record<PublishProblem, string> = {
  license_missing: 'أدخل رقم ترخيص الإعلان ورقم رخصة فال قبل النشر',
  license_expired: 'ترخيص الإعلان منتهي، حدّثه قبل النشر',
  specs_incomplete: 'أكمل الحقول الإلزامية في المواصفات قبل النشر',
  no_photos: 'أضف صورة واحدة على الأقل قبل النشر',
  deleted: 'العقار محذوف',
};

/**
 * Public coordinates: exact, or deterministically jittered within ±250 m when
 * showExactLocation = false (docs/01). Same output for the same property, so it cannot be averaged out.
 */
export function publicLocation(id: number, lat: number, lng: number, exact: boolean): { lat: number; lng: number } {
  if (exact) return { lat, lng };
  let seed = (id * 2654435761) % 4294967296;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5; // −0.5…0.5
  };
  const dLat = (rnd() * 2 * 250) / 111_320;
  const dLng = (rnd() * 2 * 250) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: Math.round((lat + dLat) * 1e6) / 1e6, lng: Math.round((lng + dLng) * 1e6) / 1e6 };
}

export { isClosed };

/** Money kind fields inside specs are halalas in the DB and SAR in the public payload (frontend contract). */
export const MONEY_SPEC_KEYS = ['annualIncome', 'deposit'] as const;
