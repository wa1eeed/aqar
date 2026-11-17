import { VIEWING_STATUSES } from '@nx/schema';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { plainText } from '../../common/security/zod-helpers';

const cuid = z.string().regex(/^[a-z0-9]{10,40}$/i);
const iso = z.string().datetime({ offset: true });

export const viewingsQuery = z
  .object({ from: iso, to: iso, agentId: cuid.optional(), status: z.enum(VIEWING_STATUSES).optional() })
  .strict();
export type ViewingsQueryInput = z.infer<typeof viewingsQuery>;
export class ViewingsQueryDto extends createZodDto(viewingsQuery) {}

export const createViewing = z
  .object({
    propertyId: z.number().int().min(1).max(2_147_483_647),
    leadId: cuid.nullish(),
    agentId: cuid.nullish(),
    scheduledAt: iso,
    durationMin: z.number().int().min(15).max(240).default(45),
    status: z.enum(['requested', 'confirmed']).optional(),
    notes: z.union([z.literal(''), plainText(1000)]).nullish(),
  })
  .strict();
export type CreateViewingInput = z.infer<typeof createViewing>;
export class CreateViewingDto extends createZodDto(createViewing) {}

export const updateViewing = z
  .object({
    scheduledAt: iso.optional(),
    durationMin: z.number().int().min(15).max(240).optional(),
    agentId: cuid.optional(),
    status: z.enum(VIEWING_STATUSES).optional(),
    notes: z.union([z.literal(''), plainText(1000)]).nullish(),
  })
  .strict();
export type UpdateViewingInput = z.infer<typeof updateViewing>;
export class UpdateViewingDto extends createZodDto(updateViewing) {}
