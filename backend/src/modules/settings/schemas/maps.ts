import { NEARBY_KEYS } from '@nx/schema';
import { z } from 'zod';
import { uniqueList } from './common';

export const mapsSettings = z
  .object({
    provider: z.enum(['osm', 'google']).default('osm'),
    defaultCenter: z
      .object({
        lat: z.number().min(-90).max(90).default(24.7136),
        lng: z.number().min(-180).max(180).default(46.6753),
      })
      .strict()
      .default({}),
    defaultZoom: z.number().int().min(3).max(19).default(11),
    nearbyRadius: z.number().int().min(100).max(10_000).default(2000),
    nearbyCategories: uniqueList(z.enum(NEARBY_KEYS)).default([...NEARBY_KEYS]),
    nearbyCacheDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();
