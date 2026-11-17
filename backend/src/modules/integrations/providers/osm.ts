import { z } from 'zod';
import { plainText } from '../../../common/security/zod-helpers';
import type { ProviderDefinition } from '../types';
import { rateLimit } from './common';

/** Tile URL template with {s}/{z}/{x}/{y}; https only (it is loaded by browsers). */
const tilesTemplate = z
  .string()
  .trim()
  .max(300)
  .regex(/^https:\/\/[A-Za-z0-9.{}-]+(\/[A-Za-z0-9._~{}/-]*)?(\?[A-Za-z0-9=&._{}-]*)?$/, 'invalid_url')
  .refine((v) => v.includes('{z}') && v.includes('{x}') && v.includes('{y}'), 'missing_placeholders');

export const osmConfig = z
  .object({
    tilesUrl: tilesTemplate.default('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'),
    attribution: plainText(200).default('© مساهمو OpenStreetMap'),
    rateLimitPerMin: rateLimit,
  })
  .strict();

export const osmMaps: ProviderDefinition<typeof osmConfig, z.ZodObject<Record<string, never>>> = {
  key: 'maps.osm',
  category: 'maps',
  nameAr: 'OpenStreetMap',
  descriptionAr: 'خرائط مجانية (افتراضي)',
  docsUrl: 'https://operations.osmfoundation.org/policies/tiles/',
  configSchema: osmConfig,
  secretsSchema: z.object({}).strict(),
  uiHints: {
    tilesUrl: { labelAr: 'رابط طبقة الخريطة', type: 'url', helpAr: 'يحتوي {z} و{x} و{y}' },
    attribution: { labelAr: 'نص حقوق الخريطة', type: 'text' },
  },
  supportsSandbox: false,
  defaultEnabled: true,
  // Tiles are loaded by the browser; nothing to call from the server.
  async testConnection(ctx) {
    return { ok: true, messageAr: `القالب صالح: ${ctx.config.tilesUrl}` };
  },
};
