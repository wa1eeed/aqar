// بناة JSON-LD (Schema.org) — نقيّة وقابلة للاختبار (docs/07 §11.6).

export function organizationLd(p: {
  name: string;
  url: string;
  logo?: string | null;
  phone?: string;
  email?: string;
  address?: string;
  sameAs?: string[];
  falLicense?: string;
  ejarMembership?: string;
  cr?: string;
}): Record<string, unknown> {
  const credentials = [
    p.falLicense && { '@type': 'EducationalOccupationalCredential', credentialCategory: 'REGA FAL', identifier: p.falLicense },
    p.ejarMembership && { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Ejar', identifier: p.ejarMembership },
  ].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: p.name,
    url: p.url,
    ...(p.logo ? { logo: p.logo } : {}),
    ...(p.phone ? { telephone: p.phone } : {}),
    ...(p.email ? { email: p.email } : {}),
    ...(p.address ? { address: { '@type': 'PostalAddress', streetAddress: p.address, addressCountry: 'SA' } } : {}),
    ...(p.sameAs?.length ? { sameAs: p.sameAs } : {}),
    ...(p.cr ? { taxID: p.cr } : {}),
    ...(credentials.length ? { hasCredential: credentials } : {}),
  };
}

export function websiteLd(siteName: string, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${url}/properties?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

export function realEstateListingLd(p: {
  name: string;
  description: string;
  url: string;
  images: string[];
  priceSar: number;
  area?: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  districtName: string;
  cityLabel: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: p.name,
    description: p.description,
    url: p.url,
    ...(p.images.length ? { image: p.images } : {}),
    offers: { '@type': 'Offer', price: p.priceSar, priceCurrency: 'SAR' },
    ...(p.area ? { floorSize: { '@type': 'QuantitativeValue', value: p.area, unitCode: 'MTK' } } : {}),
    ...(p.bedrooms != null ? { numberOfRooms: p.bedrooms } : {}),
    ...(p.bathrooms != null ? { numberOfBathroomsTotal: p.bathrooms } : {}),
    address: { '@type': 'PostalAddress', addressLocality: p.cityLabel, addressRegion: p.districtName, addressCountry: 'SA' },
  };
}

export function faqPageLd(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function scriptTag(ld: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}
