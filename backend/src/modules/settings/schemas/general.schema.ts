import { z } from 'zod';

export const generalSchema = z.object({
  listingCodePrefix: z.string().min(1).max(8).default('MZ'),
  timezone: z.string().default('Asia/Riyadh'),
  defaultPageSize: z.number().int().min(1).max(100).default(12),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().default(''),
  publicUrl: z.string().url().or(z.literal('')).default(''),
});

export type GeneralSettings = z.infer<typeof generalSchema>;
