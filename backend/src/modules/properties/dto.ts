import { OFFER_KEYS, STATUS_KEYS, TYPE_KEYS } from '@nx/schema';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { plainText } from '../../common/security/zod-helpers';
import { policySchema } from '../settings/schemas/booking';

const halalas = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const keyword = plainText(60).pipe(z.string().min(1));

/** Description: plain paragraphs (no HTML; the frontend escapes and renders line breaks). */
const description = z
  .string()
  .max(10_000)
  .refine((v) => !/[<>]/.test(v), 'html_not_allowed')
  .transform((v) => v.replace(/\r\n/g, '\n').trim());

export const propertyFields = {
  type: z.enum(TYPE_KEYS),
  offer: z.enum(OFFER_KEYS),
  title: plainText(140).pipe(z.string().min(5)),
  description: description.pipe(z.string().min(10)),
  featured: z.boolean().default(false),
  agentId: z.string().min(1).max(40).optional(),
  cityId: z.string().regex(/^[a-z_]{2,40}$/),
  districtId: z.string().min(1).max(40),
  lat: z.number().min(16).max(33), // Saudi Arabia bounding box
  lng: z.number().min(34).max(56),
  showExactLocation: z.boolean().default(true),
  price: halalas.refine((v) => v > 0, 'price_required'),
  rentPeriod: z.enum(['yearly', 'monthly', 'daily']).nullable().default(null),
  negotiable: z.boolean().default(false),
  specs: z.record(z.string().max(40), z.unknown()).default({}),
  bookingEnabled: z.boolean().default(true),
  paymentPolicy: policySchema.nullable().default(null),
  seoTitle: plainText(70).nullable().default(null),
  seoDescription: plainText(170).nullable().default(null),
  focusKeyword: plainText(60).nullable().default(null),
  keywords: z.array(keyword).max(20).default([]),
  noindex: z.boolean().default(false),
};

const create = z
  .object(propertyFields)
  .strict()
  .refine((p) => (p.offer === 'rent') === (p.rentPeriod !== null), {
    message: 'rent_period_mismatch',
    path: ['rentPeriod'],
  });

export class CreatePropertyDto extends createZodDto(create) {}

/** Partial update; type/offer/specs consistency is re-checked in the service. */
export class UpdatePropertyDto extends createZodDto(
  z
    .object(
      Object.fromEntries(Object.entries(propertyFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as {
        [K in keyof typeof propertyFields]: z.ZodOptional<(typeof propertyFields)[K]>;
      },
    )
    .extend({
      slug: z
        .string()
        .trim()
        .max(80)
        .regex(/^[\p{L}\p{N}-]+$/u, 'invalid_slug')
        .optional(),
    })
    .strict(),
) {}

export class StatusDto extends createZodDto(
  z.object({ status: z.enum(STATUS_KEYS), reason: plainText(300).optional() }).strict(),
) {}
