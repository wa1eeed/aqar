import { schemaData } from '@manzilah/schema';
import { halalasToSar } from '../../common/money.js';

type Specs = Record<string, unknown>;

/** السعر السنوي التقريبي (للمقارنة والفرز): إيجار شهري ×12، يومي ×365، غير ذلك = السعر. */
export function annualisedPrice(offer: string, price: bigint, rentPeriod?: string | null): bigint {
  if (offer !== 'rent') return price;
  if (rentPeriod === 'monthly') return price * 12n;
  if (rentPeriod === 'daily') return price * 365n;
  return price;
}

/** سعر المتر بالهللات (للبيع/الاستثمار فقط). */
export function pricePerMeterHalalas(offer: string, price: bigint, area: number): bigint | null {
  if (offer !== 'rent' && area > 0) return BigInt(Math.round(Number(price) / area));
  return null;
}

/** slug عربي-آمن من العنوان (أحرف/أرقام، مسافات → شرطة، 80 محرفاً). */
export function slugify(title: string): string {
  const s = title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return s || 'listing';
}

/** العائد السنوي %: من specs.roi أو محسوب من الدخل السنوي ÷ السعر. */
export function computeRoi(offer: string, price: bigint, specs: Specs): number | null {
  if (typeof specs.roi === 'number') return specs.roi;
  if (offer === 'investment' && typeof specs.annualIncome === 'number' && price > 0n) {
    return Number(((specs.annualIncome / Number(price)) * 100).toFixed(2));
  }
  return null;
}

export interface DerivedColumns {
  slug: string;
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

/** يشتقّ الأعمدة المخزّنة من specs (docs/01 §Derived). */
export function deriveColumns(input: {
  title: string;
  type: string;
  offer: string;
  price: bigint;
  rentPeriod?: string | null;
  specs: Specs;
}): DerivedColumns {
  const { specs } = input;
  const area = typeof specs.area === 'number' ? specs.area : 0;
  return {
    slug: slugify(input.title),
    annualisedPrice: annualisedPrice(input.offer, input.price, input.rentPeriod),
    pricePerMeter: pricePerMeterHalalas(input.offer, input.price, area),
    area,
    bedrooms: typeof specs.bedrooms === 'number' ? specs.bedrooms : null,
    bathrooms: typeof specs.bathrooms === 'number' ? specs.bathrooms : null,
    roi: computeRoi(input.offer, input.price, specs),
    adLicenseNo: String(specs.adLicense ?? ''),
    falLicenseNo: String(specs.falLicense ?? ''),
    licenseExpiry: specs.licenseExpiry ? new Date(String(specs.licenseExpiry)) : null,
  };
}

/** "ملخّص سريع" (answer-first) يُولّد من specs (docs/07 §11.6). */
export function buildSummary(p: {
  type: string;
  offer: string;
  districtName: string;
  cityLabel: string;
  price: bigint;
  status: string;
  specs: Specs;
}): string {
  const typeLabel = schemaData.types[p.type]?.label ?? p.type;
  const offerLabel = schemaData.offers[p.offer as 'sale']?.label ?? p.offer;
  const statusLabel = schemaData.statuses[p.status]?.label ?? p.status;
  const parts = [`${typeLabel} ${offerLabel} في حي ${p.districtName} ب${p.cityLabel}`];
  if (typeof p.specs.area === 'number') parts.push(`المساحة ${p.specs.area} م²`);
  if (typeof p.specs.bedrooms === 'number') parts.push(`${p.specs.bedrooms} غرف نوم`);
  parts.push(`السعر ${new Intl.NumberFormat('en-US').format(halalasToSar(p.price))} ر.س`);
  parts.push(`الحالة: ${statusLabel}`);
  return parts.join('، ');
}
