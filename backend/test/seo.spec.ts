import { describe, it, expect } from 'vitest';
import { contrastRatio, checkBrandingContrast } from '../src/modules/theme/contrast.js';
import { ThemeService } from '../src/modules/theme/theme.service.js';
import { realEstateListingLd, faqPageLd, breadcrumbLd } from '../src/modules/seo/jsonld.js';

describe('contrast (WCAG)', () => {
  it('أبيض/أسود = 21، ونفس اللون = 1', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });
  it('يرصد تبايناً منخفضاً', () => {
    const fails = checkBrandingContrast({ ink: '#333333', background: '#FFFFFF', primary: '#EFEFEF', surface: '#FFFFFF', accentInk: '#777777' });
    expect(fails.some((f) => f.pair === 'primary/background')).toBe(true);
  });
});

describe('theme CSS', () => {
  it('يضع الألوان في متغيّرات CSS', () => {
    const css = ThemeService.render({
      colors: { primary: '#0F4C3A', primaryDark: '#0A2F25', accent: '#C9A86C', accentInk: '#85652F', background: '#FAF7F2', surface: '#FFFFFF', ink: '#14211C', muted: '#5F6B66' },
      fonts: { display: 'Alexandria', body: 'IBM Plex Sans Arabic' },
      radius: 'soft',
    });
    expect(css).toContain('--green:#0F4C3A');
    expect(css).toContain('--gold:#C9A86C');
    expect(css).toContain('--r:16px');
    expect(css).toContain("--f-display:'Alexandria'");
  });
});

describe('JSON-LD', () => {
  it('RealEstateListing + Offer', () => {
    const ld = realEstateListingLd({ name: 'فيلا', description: 'وصف', url: 'https://x/p/1', images: ['a.jpg'], priceSar: 4_850_000, area: 450, bedrooms: 5, bathrooms: 6, districtName: 'الملقا', cityLabel: 'الرياض' });
    expect(ld['@type']).toBe('RealEstateListing');
    expect((ld.offers as { price: number }).price).toBe(4_850_000);
    expect(ld.numberOfRooms).toBe(5);
  });
  it('FAQPage + Breadcrumb', () => {
    expect((faqPageLd([{ q: 'س', a: 'ج' }]).mainEntity as unknown[]).length).toBe(1);
    const bc = breadcrumbLd([{ name: 'أ', url: 'u1' }, { name: 'ب', url: 'u2' }]);
    expect((bc.itemListElement as { position: number }[])[1].position).toBe(2);
  });
});
