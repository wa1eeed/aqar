import { derive, publicLocation, publishProblems, slugify, statusAllowed, validateSpecs } from './property-rules';

describe('property rules (docs/01 derived fields)', () => {
  it('slugifies Arabic titles', () => {
    expect(slugify('فيلا مودرن بدرج داخلي ومسبح خاص')).toBe('فيلا-مودرن-بدرج-داخلي-ومسبح-خاص');
    expect(slugify('  شقّة — 3 غرف! <script>  ')).toBe('شقة-3-غرف-script');
    expect(slugify('!!!')).toBe('property');
    expect(slugify('أ'.repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it('derives annualised price, price per metre, ROI and licence columns', () => {
    const monthly = derive('rent', 600_000n, 'monthly', { area: 120 });
    expect(monthly.annualisedPrice).toBe(7_200_000n);
    expect(monthly.pricePerMeter).toBeNull();
    expect(derive('rent', 10_000n, 'daily', { area: 10 }).annualisedPrice).toBe(3_650_000n);

    const sale = derive('sale', 485_000_000n, null, {
      area: 450,
      bedrooms: 5,
      adLicense: ' 7200001001 ',
      falLicense: '1100000101',
      licenseExpiry: '2027-05-10',
    });
    expect(sale).toMatchObject({
      annualisedPrice: 485_000_000n,
      pricePerMeter: 1_077_778n,
      area: 450,
      bedrooms: 5,
      adLicenseNo: '7200001001',
    });
    expect(sale.licenseExpiry?.toISOString()).toBe('2027-05-10T00:00:00.000Z');

    const inv = derive('investment', 920_000_000n, null, { area: 1050, annualIncome: 72_000_000 });
    expect(inv.roi).toBe(7.83);
    expect(derive('investment', 920_000_000n, null, { area: 1050, roi: 7.8, annualIncome: 1 }).roi).toBe(7.8);
  });

  it('validates specs leniently for drafts and strictly for publishing', () => {
    expect(validateSpecs('villa', 'sale', { area: 300 }, 'draft').ok).toBe(true);
    expect(validateSpecs('villa', 'sale', { area: 300 }, 'publish').ok).toBe(false);
    expect(validateSpecs('villa', 'sale', { area: 300, wells: 3 }, 'draft').ok).toBe(false); // not a villa field
  });

  it('restricts statuses per offer', () => {
    expect(statusAllowed('rent', 'rented')).toBe(true);
    expect(statusAllowed('rent', 'sold')).toBe(false);
    expect(statusAllowed('sale', 'rented')).toBe(false);
  });

  it('blocks publishing without a valid licence', () => {
    const base = {
      type: 'villa',
      offer: 'sale',
      specs: { area: 300, adLicense: '7200001001', falLicense: '1100000101' },
      adLicenseNo: '7200001001',
      falLicenseNo: '1100000101',
      licenseExpiry: new Date(Date.now() + 86_400_000),
      readyPhotos: 3,
      deletedAt: null,
    };
    expect(publishProblems(base)).toEqual([]);
    expect(publishProblems({ ...base, adLicenseNo: '' })).toContain('license_missing');
    expect(publishProblems({ ...base, licenseExpiry: new Date('2020-01-01') })).toContain('license_expired');
    expect(publishProblems({ ...base, readyPhotos: 0 })).toContain('no_photos');
  });

  it('jitters hidden locations deterministically within 250 m', () => {
    const a = publicLocation(1001, 24.8, 46.6, false);
    expect(publicLocation(1001, 24.8, 46.6, false)).toEqual(a);
    expect(publicLocation(1001, 24.8, 46.6, true)).toEqual({ lat: 24.8, lng: 46.6 });
    expect(Math.abs(a.lat - 24.8) * 111_320).toBeLessThanOrEqual(250);
    expect(Math.abs(a.lng - 46.6) * 111_320 * Math.cos((24.8 * Math.PI) / 180)).toBeLessThanOrEqual(250);
    expect(a).not.toEqual({ lat: 24.8, lng: 46.6 });
  });
});
