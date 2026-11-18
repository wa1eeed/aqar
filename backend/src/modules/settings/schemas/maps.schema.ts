import { z } from 'zod';
import { schemaData } from '@manzilah/schema';

export const mapsSchema = z.object({
  provider: z.enum(['osm', 'google']).default('osm'),
  defaultCenter: z.tuple([z.number(), z.number()]).default([24.7136, 46.6753]),
  defaultZoom: z.number().int().min(1).max(20).default(11),
  nearbyRadius: z.number().int().positive().default(2000),
  nearbyCategories: z.array(z.string()).default(Object.keys(schemaData.nearby)),
  nearbyCacheDays: z.number().int().positive().default(30),
});

export type MapsSettings = z.infer<typeof mapsSchema>;
