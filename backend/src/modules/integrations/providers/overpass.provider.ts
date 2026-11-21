import { z } from 'zod';
import { schemaData } from '@manzilah/schema';
import type { NearbyItem } from '../capabilities.js';
import type { ProviderDefinition } from '../provider-definition.js';

const configSchema = z.object({
  endpoint: z.string().url().default('https://overpass-api.de/api/interpreter'),
  maxPerCategory: z.number().int().positive().default(10),
});
type Config = z.infer<typeof configSchema>;
const secretsSchema = z.object({});
type Secrets = z.infer<typeof secretsSchema>;

export const overpassProvider: ProviderDefinition<Config, Secrets> = {
  key: 'places.overpass',
  category: 'places',
  scope: 'platform',
  nameAr: 'أماكن OpenStreetMap (Overpass)',
  descriptionAr: 'الخدمات القريبة من العقار عبر Overpass API (تُستدعى من الخادم فقط).',
  configSchema,
  secretsSchema,
  uiHints: {
    endpoint: { labelAr: 'نقطة Overpass', type: 'url' },
    maxPerCategory: { labelAr: 'أقصى نتائج لكل صنف', type: 'number' },
  },
  supportsSandbox: false,
  enabledByDefault: true,
  async testConnection(ctx) {
    try {
      const res = await fetch(ctx.config.endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent('[out:json][timeout:5];out count;'),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok
        ? { ok: true, messageAr: 'تم الاتصال بـ Overpass' }
        : { ok: false, messageAr: `فشل الاتصال (HTTP ${res.status})` };
    } catch {
      return { ok: false, messageAr: 'تعذّر الوصول إلى Overpass' };
    }
  },
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

interface OverpassEl {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** يجلب الخدمات القريبة لكل صنف من أصناف packages/schema.nearby. */
export async function overpassNearby(
  cfg: Config,
  lat: number,
  lng: number,
  radius: number,
  cats: string[],
): Promise<NearbyItem[]> {
  const out: NearbyItem[] = [];
  for (const cat of cats) {
    const def = schemaData.nearby[cat];
    if (!def) continue;
    const q = `[out:json][timeout:20];(node(around:${radius},${lat},${lng})${def.osm};way(around:${radius},${lat},${lng})${def.osm};);out center ${cfg.maxPerCategory};`;
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OverpassEl[] };
      for (const el of data.elements ?? []) {
        const elat = el.lat ?? el.center?.lat;
        const elng = el.lon ?? el.center?.lon;
        if (elat == null || elng == null) continue;
        out.push({
          id: `${cat}:${el.id}`,
          cat,
          name: el.tags?.name ?? def.label,
          lat: elat,
          lng: elng,
          distance: haversine(lat, lng, elat, elng),
        });
      }
    } catch {
      // صنف فشل لا يُفشل البقية
      continue;
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export type { Config as OverpassConfig };
