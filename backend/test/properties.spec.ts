import { describe, it, expect } from 'vitest';
import {
  annualisedPrice,
  pricePerMeterHalalas,
  slugify,
  deriveColumns,
  buildSummary,
} from '../src/modules/properties/derive.js';
import { buildPublicPayload, type PropertyRow } from '../src/modules/properties/property-payload.js';

describe('derive', () => {
  it('annualisedPrice', () => {
    expect(annualisedPrice('sale', 1000n)).toBe(1000n);
    expect(annualisedPrice('rent', 1000n, 'monthly')).toBe(12000n);
    expect(annualisedPrice('rent', 1000n, 'daily')).toBe(365000n);
    expect(annualisedPrice('rent', 1000n, 'yearly')).toBe(1000n);
  });

  it('pricePerMeterHalalas (بيع فقط)', () => {
    expect(pricePerMeterHalalas('sale', 485_000_000n, 450)).toBe(1_077_778n);
    expect(pricePerMeterHalalas('rent', 1000n, 100)).toBeNull();
  });

  it('slugify عربي-آمن', () => {
    expect(slugify('فيلا مودرن! @ 2')).toBe('فيلا-مودرن-2');
    expect(slugify('   ')).toBe('listing');
  });

  it('deriveColumns ينسخ من specs', () => {
    const d = deriveColumns({
      title: 'فيلا',
      type: 'villa',
      offer: 'sale',
      price: 485_000_000n,
      specs: { area: 450, bedrooms: 5, bathrooms: 6, adLicense: 'A1', falLicense: 'F1', licenseExpiry: '2027-05-10' },
    });
    expect(d.area).toBe(450);
    expect(d.bedrooms).toBe(5);
    expect(d.adLicenseNo).toBe('A1');
    expect(d.licenseExpiry?.toISOString().slice(0, 10)).toBe('2027-05-10');
  });

  it('buildSummary', () => {
    const s = buildSummary({
      type: 'villa',
      offer: 'sale',
      districtName: 'الملقا',
      cityLabel: 'الرياض',
      price: 485_000_000n,
      status: 'available',
      specs: { area: 450, bedrooms: 5 },
    });
    expect(s).toContain('فيلا للبيع في حي الملقا بالرياض');
    expect(s).toContain('المساحة 450 م²');
    expect(s).toContain('الحالة: متاح');
  });
});

describe('buildPublicPayload', () => {
  const row: PropertyRow = {
    id: 1001, code: 'MZ-1001', slug: 'فيلا', type: 'villa', offer: 'sale', status: 'available',
    featured: true, title: 'فيلا', description: 'وصف', cityId: 'riyadh', lat: 24.8, lng: 46.6,
    price: 485_000_000n, rentPeriod: null, negotiable: true, pricePerMeter: 1_077_778n,
    specs: { area: 450, bedrooms: 5 }, adLicenseNo: 'A1', falLicenseNo: 'F1', licenseExpiry: null,
    adLicenseCheck: 'unknown', bookingEnabled: true, createdAt: new Date('2026-11-10T00:00:00Z'),
  };

  it('يبني الحمولة بالسعر بالريال والصور', () => {
    const payload = buildPublicPayload(row, {
      cityLabel: 'الرياض',
      districtName: 'الملقا',
      agent: null,
      media: [{ kind: 'photo', variants: { card: 'photos/a.jpg', thumb: 'photos/a.jpg', full: 'photos/a.jpg' }, externalUrl: null, altAr: null, isCover: true, sort: 0 }],
      bookingPolicy: null,
      bookingGloballyEnabled: true,
      ejarMembership: '',
    });
    expect(payload.price).toBe(4_850_000);
    expect(payload.priceHalalas).toBe(485_000_000);
    expect(payload.pricePerMeter).toBe(10_778);
    expect(payload.images).toEqual(['photos/a.jpg']);
    expect(payload.url).toBe('/property/1001-فيلا');
    expect(payload.cityLabel).toBe('الرياض');
  });
});
