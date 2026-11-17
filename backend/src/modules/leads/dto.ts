import { LEAD_SOURCES, LEAD_STAGES, LEAD_TYPES } from '@nx/schema';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SAUDI_MOBILE } from '../../common/security/phone';
import { plainText } from '../../common/security/zod-helpers';

const cuid = z.string().regex(/^[a-z0-9]{10,40}$/i);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = (max: number) => z.union([z.literal(''), plainText(max)]).nullish();
const email = z.union([z.literal(''), z.string().trim().toLowerCase().max(254).email('invalid_email')]).nullish();

export const leadsQuery = z
  .object({
    stage: z.enum(LEAD_STAGES).optional(),
    type: z.enum(LEAD_TYPES).optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    assignedToId: z.union([z.literal('none'), cuid]).optional(),
    from: day.optional(),
    to: day.optional(),
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type LeadsQueryInput = z.infer<typeof leadsQuery>;
export class LeadsQueryDto extends createZodDto(leadsQuery) {}

export const updateLead = z
  .object({
    name: plainText(80).pipe(z.string().min(2)).optional(),
    phone: z.string().trim().max(20).regex(SAUDI_MOBILE, 'invalid_phone').optional(),
    email,
    message: optText(2000),
    propertyId: z.number().int().min(1).max(2_147_483_647).nullable().optional(),
  })
  .strict();
export type UpdateLeadInput = z.infer<typeof updateLead>;
export class UpdateLeadDto extends createZodDto(updateLead) {}

export class StageDto extends createZodDto(
  z.object({ stage: z.enum(LEAD_STAGES), lostReason: plainText(300).optional() }).strict(),
) {}

export class AssignDto extends createZodDto(z.object({ assignedToId: cuid.nullable() }).strict()) {}

export class ActivityDto extends createZodDto(
  z
    .object({
      type: z.enum(['note', 'call', 'whatsapp', 'email']),
      body: plainText(2000).pipe(z.string().min(1)),
    })
    .strict(),
) {}

export const manualLead = z
  .object({
    type: z.enum(LEAD_TYPES),
    source: z.enum(['phone', 'whatsapp', 'walk_in', 'admin']).default('admin'),
    propertyId: z.number().int().min(1).max(2_147_483_647).nullish(),
    name: plainText(80).pipe(z.string().min(2)),
    phone: z.string().trim().max(20).regex(SAUDI_MOBILE, 'invalid_phone'),
    email,
    message: optText(2000),
    assignedToId: cuid.nullish(),
  })
  .strict();
export type ManualLeadInput = z.infer<typeof manualLead>;
export class ManualLeadDto extends createZodDto(manualLead) {}
