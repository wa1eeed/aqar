import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'لون hex غير صالح');

export const brandingSchema = z.object({
  name: z.string().default('منزلة'),
  fullName: z.string().default('منزلة العقارية'),
  tagline: z.string().default('عقارات تليق بمنزلتك'),
  logoLightKey: z.string().nullable().default(null),
  logoDarkKey: z.string().nullable().default(null),
  faviconSourceKey: z.string().nullable().default(null),
  socialShareImageKey: z.string().nullable().default(null),
  emailLogoKey: z.string().nullable().default(null),
  colors: z
    .object({
      primary: hex.default('#0F4C3A'),
      primaryDark: hex.default('#0A2F25'),
      accent: hex.default('#C9A86C'),
      accentInk: hex.default('#85652F'),
      background: hex.default('#FAF7F2'),
      surface: hex.default('#FFFFFF'),
      ink: hex.default('#14211C'),
      muted: hex.default('#5F6B66'),
    })
    .default({}),
  fonts: z
    .object({
      display: z.string().default('Alexandria'),
      body: z.string().default('IBM Plex Sans Arabic'),
    })
    .default({}),
  radius: z.enum(['sharp', 'soft', 'round']).default('soft'),
});

export type BrandingSettings = z.infer<typeof brandingSchema>;
