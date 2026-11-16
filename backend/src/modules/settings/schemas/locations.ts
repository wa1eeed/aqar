import { z } from 'zod';

/** Cities and districts live in their own tables (City, District); this section holds display options. */
export const locationsSettings = z
  .object({
    defaultCityId: z
      .string()
      .regex(/^[a-z_]{2,40}$/)
      .default('riyadh'),
  })
  .strict();
