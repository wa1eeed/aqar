import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { brandingSettings } from '../settings/schemas/branding';

export type Branding = z.infer<typeof brandingSettings>;
type Theme = Branding['theme'];

/** Defaults of `frontend/assets/css/main.css` — with these values /theme.css changes nothing. */
const DEFAULT = { primary: '#0F4C3A', accent: '#C9A86C', green2: '#176149', green50: '#E8F1EC', gold50: '#F7EFDF' };
const DEFAULT_FONTS = ['Alexandria', 'IBM Plex Sans Arabic'];

/** Theme presets (docs/07 §10.1); the admin fills the colour pickers from them. */
export const PRESETS: Record<string, Partial<Theme>> = {
  default: {
    primary: '#0F4C3A',
    primaryDark: '#0A2F25',
    accent: '#C9A86C',
    accentInk: '#85652F',
    background: '#FAF7F2',
  },
  royal_blue_gold: {
    primary: '#1D3A8A',
    primaryDark: '#122459',
    accent: '#C9A86C',
    accentInk: '#7E5F27',
    background: '#F7F8FC',
  },
  maroon_beige: {
    primary: '#6E1E2B',
    primaryDark: '#47121B',
    accent: '#D8C3A0',
    accentInk: '#7A5A2E',
    background: '#FBF7F1',
  },
  charcoal_teal: {
    primary: '#23302F',
    primaryDark: '#151D1C',
    accent: '#2A9D8F',
    accentInk: '#1C6B61',
    background: '#F6F7F6',
  },
  nx_teal: {
    primary: '#0E5E6F',
    primaryDark: '#093C47',
    accent: '#E0B65C',
    accentInk: '#86651E',
    background: '#F5F9F9',
  },
};

// ───────────── colour helpers ─────────────
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function hex([r, g, b]: number[]): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v!)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}
/** Mix `a` with `b`: weight = share of `a` (0–1). */
export function mix(a: string, b: string, weight: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v * weight + y[i]! * (1 - weight)));
}
/** WCAG 2.1 relative luminance and contrast ratio. */
function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/** Pairs checked by the accessibility guard (docs/07 §10.1); each must reach 4.5:1. */
export function contrastProblems(t: Theme): Array<{ pair: string; ratio: number }> {
  const pairs: Array<[string, string, string]> = [
    ['ink/background', t.ink, t.background],
    ['white/primary', '#FFFFFF', t.primary],
    ['accentInk/surface', t.accentInk, t.surface],
    ['primary/background', t.primary, t.background],
  ];
  return pairs
    .map(([pair, a, b]) => ({ pair, ratio: Math.round(contrast(a, b) * 100) / 100 }))
    .filter((p) => p.ratio < 4.5);
}

const fontStack = (f: string, fallback: string) => `'${f}', ${fallback}`;
function googleFontsImport(fonts: string[]): string {
  const extra = [...new Set(fonts)].filter((f) => !DEFAULT_FONTS.includes(f));
  if (!extra.length) return '';
  const families = extra.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
  return `@import url('https://fonts.googleapis.com/css2?${families}&display=swap');\n`;
}

/**
 * /theme.css (docs/07 §10.1, docs/08 §1): CSS custom properties consumed by the site and the admin.
 * Every value comes from a validated hex colour, an allow-listed font or a fixed radius, so no
 * user-controlled text reaches the stylesheet.
 */
export function themeCss(b: Branding): string {
  const t = b.theme;
  const same = (x: string, y: string) => x.toUpperCase() === y.toUpperCase();
  const green2 = same(t.primary, DEFAULT.primary) ? DEFAULT.green2 : mix(t.primary, '#FFFFFF', 0.88);
  const green50 = same(t.primary, DEFAULT.primary) ? DEFAULT.green50 : mix(t.primary, '#FFFFFF', 0.1);
  const gold50 = same(t.accent, DEFAULT.accent) ? DEFAULT.gold50 : mix(t.accent, '#FFFFFF', 0.15);
  const r = b.radius;
  const vars: Array<[string, string]> = [
    ['--green', t.primary],
    ['--green-2', green2],
    ['--green-900', t.primaryDark],
    ['--green-50', green50],
    ['--gold', t.accent],
    ['--gold-ink', t.accentInk],
    ['--gold-50', gold50],
    ['--bg', t.background],
    ['--surface', t.surface],
    ['--ink', t.ink],
    ['--muted', t.muted],
    ['--st-available', t.statusColors.available],
    ['--st-negotiation', t.statusColors.negotiation],
    ['--st-reserved', t.statusColors.reserved],
    ['--st-sold', t.statusColors.sold],
    ['--st-rented', t.statusColors.rented],
    ['--of-sale', t.offerColors.sale],
    ['--of-rent', t.offerColors.rent],
    ['--of-investment', t.offerColors.investment],
    ['--r-sm', `${Math.max(4, r - 6)}px`],
    ['--r', `${r}px`],
    ['--r-lg', `${r + 8}px`],
    ['--r-xl', `${r + 16}px`],
    ['--f-display', fontStack(b.fontDisplay, "'IBM Plex Sans Arabic', Tahoma, sans-serif")],
    ['--f-body', fontStack(b.fontBody, "Tahoma, 'Segoe UI', system-ui, sans-serif")],
  ];
  return (
    `/* Generated from the admin settings «الهوية والمظهر» — do not edit. */\n` +
    googleFontsImport([b.fontDisplay, b.fontBody]) +
    `:root {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`
  );
}

/** Short content hash used as `/theme.css?v=…` (changes whenever the output changes). */
export function themeVersion(css: string): string {
  return createHash('sha256').update(css).digest('hex').slice(0, 12);
}
