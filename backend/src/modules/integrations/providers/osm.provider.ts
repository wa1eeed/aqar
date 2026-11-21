import { z } from 'zod';
import type { MapsPublicConfig } from '../capabilities.js';
import type { ProviderCtx, ProviderDefinition } from '../provider-definition.js';

const configSchema = z.object({
  tilesUrl: z.string().default('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'),
  attribution: z.string().default('&copy; مساهمو OpenStreetMap'),
});
type Config = z.infer<typeof configSchema>;
const secretsSchema = z.object({});
type Secrets = z.infer<typeof secretsSchema>;

export const osmProvider: ProviderDefinition<Config, Secrets> = {
  key: 'maps.osm',
  category: 'maps',
  scope: 'platform',
  nameAr: 'خرائط OpenStreetMap',
  descriptionAr: 'بلاطات خرائط مجانية تُحمّل في المتصفح.',
  configSchema,
  secretsSchema,
  uiHints: {
    tilesUrl: { labelAr: 'رابط البلاطات', type: 'url' },
    attribution: { labelAr: 'نصّ الإسناد', type: 'text' },
  },
  supportsSandbox: false,
  enabledByDefault: true,
  testConnection: () => Promise.resolve({ ok: true, messageAr: 'الخرائط المجانية جاهزة' }),
};

export function osmPublicConfig(cfg: Config): MapsPublicConfig {
  return { provider: 'osm', tilesUrl: cfg.tilesUrl, attribution: cfg.attribution };
}

export type { Config as OsmConfig };
export type OsmCtx = ProviderCtx<Config, Secrets>;
