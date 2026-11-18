import { z } from 'zod';

export const featuresSchema = z.object({
  auctions: z.boolean().default(false),
  customerAccounts: z.boolean().default(true),
  savedSearches: z.boolean().default(true),
  booking: z.boolean().default(true),
  compare: z.boolean().default(false),
});

export type FeaturesSettings = z.infer<typeof featuresSchema>;
