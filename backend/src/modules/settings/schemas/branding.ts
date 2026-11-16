import { z } from 'zod';
import { hexColor, optionalHttpUrl, plainText } from '../../../common/security/zod-helpers';

/** Curated Arabic fonts (docs/07 §10.1). An allow-list keeps /theme.css free of injected CSS. */
export const FONTS = [
  'Alexandria',
  'IBM Plex Sans Arabic',
  'Tajawal',
  'Cairo',
  'Readex Pro',
  'Almarai',
  'Noto Kufi Arabic',
  'Noto Naskh Arabic',
] as const;

export const THEME_PRESETS = [
  'default',
  'royal_blue_gold',
  'maroon_beige',
  'charcoal_teal',
  'nx_teal',
  'custom',
] as const;

const statusColors = z
  .object({
    available: hexColor.default('#1E7449'),
    negotiation: hexColor.default('#5E47A0'),
    reserved: hexColor.default('#995000'),
    sold: hexColor.default('#A3342B'),
    rented: hexColor.default('#2457A6'),
  })
  .strict();

const offerColors = z
  .object({
    sale: hexColor.default('#0F4C3A'),
    rent: hexColor.default('#2457A6'),
    investment: hexColor.default('#85652F'),
  })
  .strict();

export const brandingSettings = z
  .object({
    name: plainText(40).pipe(z.string().min(1)).default('منزلة'),
    fullName: plainText(80).pipe(z.string().min(1)).default('منزلة العقارية'),
    tagline: plainText(120).default('عقارات تليق بمنزلتك'),
    logoUrl: optionalHttpUrl,
    logoLightUrl: optionalHttpUrl,
    faviconUrl: optionalHttpUrl,
    socialImageUrl: optionalHttpUrl,
    emailLogoUrl: optionalHttpUrl,
    preset: z.enum(THEME_PRESETS).default('default'),
    theme: z
      .object({
        primary: hexColor.default('#0F4C3A'),
        primaryDark: hexColor.default('#0A2F25'),
        accent: hexColor.default('#C9A86C'),
        accentInk: hexColor.default('#85652F'),
        background: hexColor.default('#FAF7F2'),
        surface: hexColor.default('#FFFFFF'),
        ink: hexColor.default('#14211C'),
        muted: hexColor.default('#5F6B66'),
        statusColors: statusColors.default({}),
        offerColors: offerColors.default({}),
      })
      .strict()
      .default({}),
    fontDisplay: z.enum(FONTS).default('Alexandria'),
    fontBody: z.enum(FONTS).default('IBM Plex Sans Arabic'),
    /** Corner radius preset: حادّ 6 / ناعم 16 / دائري 24 */
    radius: z.union([z.literal(6), z.literal(16), z.literal(24)]).default(16),
    /** Owner override of the WCAG contrast guard (docs/07 §10.1). */
    contrastOverride: z.boolean().default(false),
  })
  .strict();
