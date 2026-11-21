import { halalasToSar } from '../../common/money.js';
import { buildSummary } from './derive.js';

interface MediaRow {
  kind: string;
  variants: unknown;
  externalUrl: string | null;
  altAr: string | null;
  isCover: boolean;
  sort: number;
}

interface AgentRow {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  whatsapp: string | null;
  falLicense: string | null;
}

interface Policy {
  paymentTypes: string[];
  defaultPaymentType: string;
  deposit: { mode: string; fixedAmount: number; percent: number; min: number | null; max: number | null };
  methods: { deposit: string[]; full: string[] };
}

export interface PropertyRow {
  id: number;
  code: string;
  slug: string;
  type: string;
  offer: string;
  status: string;
  featured: boolean;
  title: string;
  description: string;
  cityId: string;
  lat: unknown;
  lng: unknown;
  price: bigint;
  rentPeriod: string | null;
  negotiable: boolean;
  pricePerMeter: bigint | null;
  specs: unknown;
  adLicenseNo: string;
  falLicenseNo: string;
  licenseExpiry: Date | null;
  adLicenseCheck: string;
  bookingEnabled: boolean;
  createdAt: Date;
}

export interface PayloadContext {
  cityLabel: string;
  districtName: string;
  agent: AgentRow | null;
  media: MediaRow[];
  bookingPolicy: Policy | null;
  bookingGloballyEnabled: boolean;
  ejarMembership: string;
}

function variantUrls(m: MediaRow): { thumb: string; card: string; full: string } {
  if (m.variants && typeof m.variants === 'object') {
    const v = m.variants as Record<string, string>;
    const card = v.card ?? v.full ?? v.thumb ?? '';
    return { thumb: v.thumb ?? card, card, full: v.full ?? card };
  }
  const url = m.externalUrl ?? '';
  return { thumb: url, card: url, full: url };
}

function computeDeposit(policy: Policy, price: bigint): number {
  let amount =
    policy.deposit.mode === 'fixed'
      ? policy.deposit.fixedAmount
      : Math.round((Number(price) * policy.deposit.percent) / 100);
  if (policy.deposit.min != null) amount = Math.max(amount, policy.deposit.min);
  if (policy.deposit.max != null) amount = Math.min(amount, policy.deposit.max);
  return Math.min(amount, Number(price));
}

/** يبني الحمولة العامة للعقار بالشكل الذي تتوقّعه الواجهة (docs/02 §4). */
export function buildPublicPayload(p: PropertyRow, ctx: PayloadContext) {
  const specs = (p.specs ?? {}) as Record<string, unknown>;
  const photos = ctx.media
    .filter((m) => m.kind === 'photo')
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sort - b.sort)
    .map(variantUrls);

  const policy = ctx.bookingPolicy;
  const booking = {
    enabled: ctx.bookingGloballyEnabled && p.bookingEnabled,
    paymentTypes: policy?.paymentTypes ?? [],
    depositAmount: policy ? computeDeposit(policy, p.price) : 0,
    methods: policy ? policy.methods[(policy.defaultPaymentType as 'deposit') ?? 'deposit'] ?? [] : [],
  };

  return {
    id: p.id,
    code: p.code,
    slug: p.slug,
    url: `/property/${p.id}-${p.slug}`,
    type: p.type,
    offer: p.offer,
    status: p.status,
    featured: p.featured,
    title: p.title,
    description: p.description,
    city: p.cityId,
    cityLabel: ctx.cityLabel,
    district: ctx.districtName,
    lat: Number(p.lat),
    lng: Number(p.lng),
    price: halalasToSar(p.price), // SAR للتوافق مع الواجهة
    priceHalalas: Number(p.price),
    rentPeriod: p.rentPeriod,
    negotiable: p.negotiable,
    pricePerMeter: p.pricePerMeter != null ? Math.round(halalasToSar(p.pricePerMeter)) : null,
    images: photos.map((v) => v.card),
    media: ctx.media
      .filter((m) => m.kind === 'photo')
      .map((m) => {
        const v = variantUrls(m);
        return { kind: m.kind, thumb: v.thumb, card: v.card, full: v.full, alt: m.altAr ?? '' };
      }),
    createdAt: p.createdAt.toISOString().slice(0, 10),
    specs,
    agent: ctx.agent
      ? {
          id: ctx.agent.id,
          name: ctx.agent.name,
          role: ctx.agent.title ?? '',
          phone: ctx.agent.phone ?? '',
          whatsapp: ctx.agent.whatsapp ?? '',
          fal: ctx.agent.falLicense ?? '',
        }
      : null,
    booking,
    licensing: {
      adLicense: p.adLicenseNo,
      falLicense: p.falLicenseNo,
      licenseExpiry: p.licenseExpiry ? p.licenseExpiry.toISOString().slice(0, 10) : null,
      regaVerified: p.adLicenseCheck === 'valid',
      ejarMembership: ctx.ejarMembership,
    },
    summary: buildSummary({
      type: p.type,
      offer: p.offer,
      districtName: ctx.districtName,
      cityLabel: ctx.cityLabel,
      price: p.price,
      status: p.status,
      specs,
    }),
  };
}
