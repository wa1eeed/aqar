import { describe, it, expect } from 'vitest';
import {
  SETTINGS_SECTION_KEYS,
  allDefaults,
  defaultFor,
} from '../src/modules/settings/schemas/index.js';

describe('settings defaults', () => {
  it('كل الأقسام الثلاثة عشر لها افتراضيات صالحة', () => {
    expect(SETTINGS_SECTION_KEYS.length).toBe(13);
    const defaults = allDefaults();
    for (const key of SETTINGS_SECTION_KEYS) {
      expect(defaults[key]).toBeDefined();
    }
  });

  it('general.listingCodePrefix الافتراضي = MZ', () => {
    const general = defaultFor('general') as { listingCodePrefix: string };
    expect(general.listingCodePrefix).toBe('MZ');
  });

  it('branding.colors.primary الافتراضي = #0F4C3A', () => {
    const branding = defaultFor('branding') as { colors: { primary: string } };
    expect(branding.colors.primary).toBe('#0F4C3A');
  });

  it('booking.policies يحتوي sale/rent/investment', () => {
    const booking = defaultFor('booking') as { policies: Record<string, unknown> };
    expect(Object.keys(booking.policies).sort()).toEqual(['investment', 'rent', 'sale']);
  });
});
