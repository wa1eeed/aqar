import { nearby as NEARBY, type NearbyKey } from '@nx/schema';
import { z } from 'zod';
import type { ProviderCtx, ProviderDefinition, TestResult } from '../types';
import { IntegrationError } from '../types';
import { rateLimit, secret } from './common';
import { haversine, type NearbyItem } from './places';

const PLACES_BASE = 'https://places.googleapis.com/v1';

export const googleMapsConfig = z
  .object({
    mapId: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{1,64}$/),
      ])
      .default(''),
    language: z.enum(['ar', 'en']).default('ar'),
    region: z.literal('SA').default('SA'),
    rateLimitPerMin: rateLimit,
  })
  .strict();
export const googleMapsSecrets = z.object({ browserKey: secret(), serverKey: secret() }).partial().strict();

export const googlePlacesConfig = z.object({ rateLimitPerMin: rateLimit }).strict();
export const googlePlacesSecrets = z.object({ serverKey: secret() }).partial().strict();

/** Places API (New) types per nearby category (docs/05 §4). */
const TYPES: Record<NearbyKey, string[]> = {
  mosque: ['mosque'],
  school: ['school', 'primary_school', 'secondary_school'],
  health: ['hospital', 'medical_lab', 'doctor'],
  pharmacy: ['pharmacy'],
  grocery: ['supermarket', 'grocery_store', 'convenience_store'],
  mall: ['shopping_mall'],
  food: ['restaurant', 'cafe'],
  park: ['park'],
  fuel: ['gas_station'],
  bank: ['bank', 'atm'],
};

interface Place {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
}

async function placesTest(ctx: ProviderCtx<unknown, { serverKey?: string }>): Promise<TestResult> {
  if (!ctx.secrets.serverKey) return { ok: false, messageAr: 'أدخل مفتاح الخادم (Server Key)' };
  const res = await ctx.http(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: { 'X-Goog-Api-Key': ctx.secrets.serverKey, 'X-Goog-FieldMask': 'places.id' },
    json: { textQuery: 'الرياض', maxResultCount: 1, languageCode: 'ar' },
  });
  if (res.ok) return { ok: true, messageAr: 'تم الاتصال بنجاح' };
  return {
    ok: false,
    messageAr:
      res.status === 403 || res.status === 400
        ? 'المفتاح غير صالح أو الخدمة غير مفعّلة'
        : `فشل الاتصال (${res.status})`,
  };
}

export async function googleNearby(
  ctx: ProviderCtx<unknown, { serverKey?: string }>,
  lat: number,
  lng: number,
  radius: number,
  cats: NearbyKey[],
): Promise<NearbyItem[]> {
  const key = ctx.secrets.serverKey;
  if (!key) throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'google server key missing');
  const items: NearbyItem[] = [];
  for (const cat of cats) {
    const res = await ctx.http(`${PLACES_BASE}/places:searchNearby`, {
      method: 'POST',
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location' },
      json: {
        includedTypes: TYPES[cat],
        maxResultCount: 5,
        languageCode: 'ar',
        rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      },
    });
    if (!res.ok)
      throw new IntegrationError(
        'INTEGRATION_HTTP_ERROR',
        `places ${res.status}`,
        res.status,
        res.status >= 500 || res.status === 429,
      );
    const body = await res.json<{ places?: Place[] }>();
    for (const p of body.places ?? []) {
      if (!p.location) continue;
      items.push({
        id: `g:${p.id}`,
        cat,
        name: (p.displayName?.text ?? NEARBY[cat].label).slice(0, 120),
        lat: p.location.latitude,
        lng: p.location.longitude,
        distance: haversine(lat, lng, p.location.latitude, p.location.longitude),
      });
    }
  }
  return items.sort((a, b) => a.distance - b.distance);
}

export const googleMaps: ProviderDefinition<typeof googleMapsConfig, typeof googleMapsSecrets> = {
  key: 'maps.google',
  category: 'maps',
  nameAr: 'Google Maps',
  descriptionAr: 'خرائط Google وبياناتها',
  docsUrl: 'https://developers.google.com/maps/documentation',
  configSchema: googleMapsConfig,
  secretsSchema: googleMapsSecrets,
  uiHints: {
    mapId: { labelAr: 'معرّف الخريطة (Map ID)', type: 'text' },
    language: { labelAr: 'اللغة', type: 'select', optionsAr: { ar: 'العربية', en: 'الإنجليزية' } },
    region: { labelAr: 'المنطقة', type: 'text' },
    browserKey: {
      labelAr: 'مفتاح المتصفح (مقيّد بالنطاق)',
      helpAr: 'يظهر في الموقع، لذلك قيّده بنطاق موقعك من لوحة Google',
    },
    serverKey: { labelAr: 'مفتاح الخادم', helpAr: 'لا يظهر للزوار أبداً' },
  },
  supportsSandbox: false,
  testConnection: (ctx) => placesTest(ctx),
};

export const googlePlaces: ProviderDefinition<typeof googlePlacesConfig, typeof googlePlacesSecrets> = {
  key: 'places.google',
  category: 'places',
  nameAr: 'Google Places',
  descriptionAr: 'أماكن Google القريبة',
  docsUrl: 'https://developers.google.com/maps/documentation/places/web-service/nearby-search',
  configSchema: googlePlacesConfig,
  secretsSchema: googlePlacesSecrets,
  uiHints: {
    serverKey: { labelAr: 'مفتاح الخادم', helpAr: 'اتركه فارغاً لاستخدام مفتاح الخادم من تكامل Google Maps' },
    rateLimitPerMin: { labelAr: 'الحد الأقصى للطلبات في الدقيقة', type: 'number' },
  },
  supportsSandbox: false,
  testConnection: (ctx) => placesTest(ctx),
};
