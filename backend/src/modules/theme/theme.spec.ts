import { defaultsFor } from '../settings/schemas';
import { brandingSettings } from '../settings/schemas/branding';
import { contrast, contrastProblems, mix, PRESETS, themeCss, themeVersion } from './theme';

describe('theme generator', () => {
  const defaults = defaultsFor('branding');

  it('with the defaults reproduces the values of main.css exactly', () => {
    const css = themeCss(defaults);
    for (const v of [
      '--green: #0F4C3A',
      '--green-2: #176149',
      '--green-900: #0A2F25',
      '--green-50: #E8F1EC',
      '--gold: #C9A86C',
      '--gold-50: #F7EFDF',
      '--bg: #FAF7F2',
      '--r: 16px',
      '--r-lg: 24px',
      '--r-sm: 10px',
      '--r-xl: 32px',
    ]) {
      expect(css).toContain(v);
    }
    expect(css).not.toContain('@import'); // default fonts are already loaded by every page
  });

  it('derives tints from a new primary and imports non-default fonts', () => {
    const b = brandingSettings.parse({ theme: { primary: '#1D3A8A' }, fontDisplay: 'Tajawal', radius: 6 });
    const css = themeCss(b);
    expect(css).toContain('--green: #1D3A8A');
    expect(css).toContain(`--green-50: ${mix('#1D3A8A', '#FFFFFF', 0.1)}`);
    expect(css).toContain("--f-display: 'Tajawal'");
    expect(css).toContain("@import url('https://fonts.googleapis.com/css2?family=Tajawal");
    expect(css).toContain('--r: 6px');
    expect(themeVersion(css)).not.toBe(themeVersion(themeCss(defaults)));
  });

  it('contrast follows WCAG (black/white = 21) and flags weak pairs', () => {
    expect(Math.round(contrast('#000000', '#FFFFFF'))).toBe(21);
    expect(contrastProblems(defaults.theme)).toEqual([]);
    const weak = brandingSettings.parse({ theme: { primary: '#D9F2E6' } }).theme;
    expect(contrastProblems(weak).map((p) => p.pair)).toEqual(['white/primary', 'primary/background']);
  });

  it('every preset passes the contrast guard', () => {
    for (const [name, p] of Object.entries(PRESETS)) {
      const t = brandingSettings.parse({ theme: p }).theme;
      expect([name, contrastProblems(t)]).toEqual([name, []]);
    }
  });
});
