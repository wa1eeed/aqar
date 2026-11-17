import { nearby as NEARBY, type NearbyKey } from '@nx/schema';
import { z } from 'zod';
import { httpUrl } from '../../../common/security/zod-helpers';
import type { ProviderCtx, ProviderDefinition } from '../types';
import { IntegrationError } from '../types';
import { rateLimit } from './common';
import type { NearbyItem } from './places';
import { haversine } from './places';

export const overpassConfig = z
  .object({
    endpoint: httpUrl.default('https://overpass-api.de/api/interpreter'),
    radius: z.number().int().min(100).max(10_000).default(2000),
    rateLimitPerMin: rateLimit,
  })
  .strict();
type Config = z.output<typeof overpassConfig>;

/** Same tag → category mapping as the frontend api.js had (now server-side, docs/05 §4). */
function categoryOf(t: Record<string, string>): NearbyKey | null {
  if (t.amenity === 'place_of_worship') return 'mosque';
  if (t.amenity === 'school' || t.amenity === 'kindergarten') return 'school';
  if (t.amenity === 'hospital' || t.amenity === 'clinic') return 'health';
  if (t.amenity === 'pharmacy') return 'pharmacy';
  if (t.shop === 'supermarket' || t.shop === 'convenience') return 'grocery';
  if (t.shop === 'mall') return 'mall';
  if (t.amenity === 'restaurant' || t.amenity === 'cafe') return 'food';
  if (t.leisure === 'park') return 'park';
  if (t.amenity === 'fuel') return 'fuel';
  if (t.amenity === 'bank' || t.amenity === 'atm') return 'bank';
  return null;
}

export function overpassQuery(lat: number, lng: number, radius: number, cats: NearbyKey[]): string {
  const parts = cats.map((c) => `nwr${NEARBY[c].osm}(around:${radius},${lat},${lng});`).join('');
  return `[out:json][timeout:20];(${parts});out center 400;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function overpassNearby(
  ctx: ProviderCtx<Config, Record<string, never>>,
  lat: number,
  lng: number,
  radius: number,
  cats: NearbyKey[],
): Promise<NearbyItem[]> {
  const res = await ctx.http(ctx.config.endpoint, {
    method: 'POST',
    form: { data: overpassQuery(lat, lng, radius, cats) },
  });
  if (!res.ok)
    throw new IntegrationError(
      'INTEGRATION_HTTP_ERROR',
      `overpass ${res.status}`,
      res.status,
      res.status >= 500 || res.status === 429,
    );
  const body = await res.json<{ elements?: OverpassElement[] }>();
  const wanted = new Set(cats);
  const items: NearbyItem[] = [];
  for (const e of body.elements ?? []) {
    const t = e.tags ?? {};
    const eLat = e.lat ?? e.center?.lat;
    const eLng = e.lon ?? e.center?.lon;
    if (eLat === undefined || eLng === undefined) continue;
    const cat = categoryOf(t);
    if (!cat || !wanted.has(cat)) continue;
    items.push({
      id: `${e.type}${e.id}`,
      cat,
      name: (t['name:ar'] || t.name || NEARBY[cat].label.replace(/ات$|ون$/, '')).slice(0, 120),
      lat: eLat,
      lng: eLng,
      distance: haversine(lat, lng, eLat, eLng),
    });
  }
  return items.sort((a, b) => a.distance - b.distance);
}

export const overpassPlaces: ProviderDefinition<typeof overpassConfig, z.ZodObject<Record<string, never>>> = {
  key: 'places.overpass',
  category: 'places',
  nameAr: 'Overpass',
  descriptionAr: 'خدمات قريبة من OpenStreetMap',
  docsUrl: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
  configSchema: overpassConfig,
  secretsSchema: z.object({}).strict(),
  uiHints: {
    endpoint: { labelAr: 'عنوان خدمة Overpass', type: 'url' },
    radius: { labelAr: 'نطاق البحث الافتراضي (متر)', type: 'number' },
    rateLimitPerMin: { labelAr: 'الحد الأقصى للطلبات في الدقيقة', type: 'number' },
  },
  supportsSandbox: false,
  defaultEnabled: true,
  rateLimitPerMin: 30,
  async testConnection(ctx) {
    const items = await overpassNearby(ctx, 24.7136, 46.6753, 300, ['fuel', 'mosque']);
    return { ok: true, messageAr: `تم الاتصال بنجاح (${items.length} نتيجة تجريبية)` };
  },
};
