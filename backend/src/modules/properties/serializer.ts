import { city as cityOf, types } from '@nx/schema';
import type { City, District, Prisma, PropertyMedia, StaffUser } from '@prisma/client';
import { MONEY_SPEC_KEYS, publicLocation } from './property-rules';

export const PUBLIC_INCLUDE = {
  city: true,
  district: true,
  agent: true,
  media: { where: { status: 'ready' }, orderBy: [{ isCover: 'desc' }, { sort: 'asc' }] },
} satisfies Prisma.PropertyInclude;

export type PropertyWithRelations = Prisma.PropertyGetPayload<{ include: typeof PUBLIC_INCLUDE }>;

interface Variants {
  thumb?: string;
  card?: string;
  full?: string;
  webpThumb?: string;
  webpCard?: string;
  webpFull?: string;
}

const toSar = (h: bigint | number | null | undefined): number | null =>
  h === null || h === undefined ? null : Number(h) / 100;
const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function propertyUrl(id: number, slug: string): string {
  return `/property/${id}-${encodeURIComponent(slug)}`;
}

function mediaView(m: PropertyMedia) {
  const v = (m.variants ?? {}) as Variants;
  return {
    kind: m.kind,
    thumb: v.webpThumb ?? v.thumb ?? null,
    card: v.webpCard ?? v.card ?? null,
    full: v.webpFull ?? v.full ?? null,
    alt: m.altAr ?? null,
    ...(m.kind === 'video_url' ? { url: m.externalUrl } : {}),
  };
}

/** Public agent card: only what docs/02 lists (no email, no internal ids beyond the public id). */
export function agentView(a: Pick<StaffUser, 'id' | 'name' | 'title' | 'phone' | 'whatsapp' | 'falLicense'>) {
  return {
    id: a.id,
    name: a.name,
    role: a.title ?? 'مستشار عقاري',
    phone: a.phone ?? '',
    whatsapp: a.whatsapp ?? '',
    fal: a.falLicense ?? '',
  };
}

/** Specs for the browser: money kind values converted to SAR (the frontend displays SAR). */
function publicSpecs(specs: Prisma.JsonValue): Record<string, unknown> {
  const out = { ...((specs ?? {}) as Record<string, unknown>) };
  for (const k of MONEY_SPEC_KEYS) if (typeof out[k] === 'number') out[k] = (out[k] as number) / 100;
  return out;
}

/**
 * Public property payload (docs/02 §3) — the shape the existing frontend reads. `price` stays in
 * SAR; `priceHalalas` and booking amounts are halalas.
 */
export function toPublic(
  p: PropertyWithRelations & { city: City; district: District },
  opts: { ejarMembership?: string; contact?: { phone: string; whatsapp: string } } = {},
) {
  const loc = publicLocation(p.id, Number(p.lat), Number(p.lng), p.showExactLocation);
  const photos = p.media.filter((m) => m.kind === 'photo' || m.kind === 'floor_plan');
  const specs = publicSpecs(p.specs);
  if (p.roi !== null && specs.roi === undefined) specs.roi = Number(p.roi);
  const agent = p.agent.isActive && p.agent.showOnWebsite && !p.agent.deletedAt ? agentView(p.agent) : null;
  return {
    id: p.id,
    code: p.code,
    slug: p.slug,
    url: propertyUrl(p.id, p.slug),
    type: p.type,
    offer: p.offer,
    status: p.status,
    featured: p.featured,
    title: p.title,
    description: p.description,
    city: p.cityId,
    cityLabel: p.city.nameAr ?? cityOf(p.cityId)?.label ?? p.cityId,
    district: p.district.nameAr,
    lat: loc.lat,
    lng: loc.lng,
    price: toSar(p.price),
    priceHalalas: Number(p.price),
    rentPeriod: p.rentPeriod,
    negotiable: p.negotiable,
    pricePerMeter: p.pricePerMeter === null ? null : Math.round(Number(p.pricePerMeter) / 100),
    images: photos.map((m) => mediaView(m).card).filter((u): u is string => !!u),
    media: p.media.map(mediaView),
    createdAt: isoDate(p.publishedAt ?? p.createdAt),
    specs,
    // Without a visible agent the company contact is shown (the frontend expects an agent object).
    agent: agent ?? {
      id: 'company',
      name: 'فريق المبيعات',
      role: 'خدمة العملاء',
      phone: opts.contact?.phone ?? '',
      whatsapp: opts.contact?.whatsapp ?? '',
      fal: '',
    },
    licensing: {
      adLicense: p.adLicenseNo,
      falLicense: p.falLicenseNo,
      licenseExpiry: isoDate(p.licenseExpiry),
      regaVerified: p.adLicenseCheck === 'valid',
      ...(p.offer === 'rent' && opts.ejarMembership ? { ejarMembership: opts.ejarMembership } : {}),
    },
    typeLabel: types[p.type as keyof typeof types]?.label ?? p.type,
  };
}

export type PublicProperty = ReturnType<typeof toPublic>;
