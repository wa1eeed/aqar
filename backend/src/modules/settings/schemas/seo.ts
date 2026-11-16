import { z } from 'zod';
import { optionalHttpUrl, plainText } from '../../../common/security/zod-helpers';

/** AI crawlers (docs/07 §11.7). Default: allow search/answer bots, deny training-only bots. */
export const AI_CRAWLERS = {
  GPTBot: 'deny',
  'OAI-SearchBot': 'allow',
  'ChatGPT-User': 'allow',
  ClaudeBot: 'deny',
  'Claude-User': 'allow',
  PerplexityBot: 'allow',
  'Google-Extended': 'deny',
  'Applebot-Extended': 'deny',
  CCBot: 'deny',
  Bytespider: 'deny',
  Amazonbot: 'allow',
} as const;

type Bot = keyof typeof AI_CRAWLERS;
const policy = z.enum(['allow', 'deny']);
const trackingId = (re: RegExp) => z.union([z.literal(''), z.string().regex(re, 'invalid_id')]).default('');

export const seoSettings = z
  .object({
    siteName: plainText(80).default('منزلة العقارية'),
    titleTemplate: plainText(120).default('{page} | {brand}'),
    defaultDescription: plainText(300).default(
      'منزلة العقارية — عقارات للبيع والإيجار والاستثمار في المملكة العربية السعودية.',
    ),
    canonicalDomain: optionalHttpUrl,
    defaultOgImageUrl: optionalHttpUrl,
    xHandle: z.union([z.literal(''), z.string().regex(/^@?[A-Za-z0-9_]{1,15}$/)]).default(''),
    language: z.literal('ar-SA').default('ar-SA'),
    indexingEnabled: z.boolean().default(true),
    metaKeywordsEnabled: z.boolean().default(false),
    verification: z
      .object({
        google: trackingId(/^[A-Za-z0-9_-]{10,100}$/),
        bing: trackingId(/^[A-Za-z0-9]{10,64}$/),
        yandex: trackingId(/^[A-Za-z0-9]{10,64}$/),
      })
      .strict()
      .default({}),
    analytics: z
      .object({
        ga4Id: trackingId(/^G-[A-Z0-9]{4,20}$/),
        gtmId: trackingId(/^GTM-[A-Z0-9]{4,12}$/),
        metaPixelId: trackingId(/^\d{6,20}$/),
        snapPixelId: trackingId(/^[a-f0-9-]{10,64}$/),
        tiktokPixelId: trackingId(/^[A-Z0-9]{10,30}$/),
      })
      .strict()
      .default({}),
    templates: z
      .object({
        propertyTitle: plainText(200).default('{type} {offer} في حي {district}، {city} — {area} م² | {brand}'),
        propertyDescription: plainText(400).default(
          '{type} {offer} في {district} بمساحة {area} م²{bedrooms? ، {bedrooms} غرف} بسعر {price}. {firstSentence}',
        ),
        listingTitle: plainText(200).default('{type_plural} {offer} في {city} | {brand}'),
      })
      .strict()
      .default({}),
    summaryTemplate: plainText(400).default(
      '{type} {offer} في حي {district} ب{city}، المساحة {area} م²{bedrooms?، {bedrooms} غرف نوم}، السعر {price}، الحالة: {status}',
    ),
    aiCrawlers: z
      .record(z.enum(Object.keys(AI_CRAWLERS) as [Bot, ...Bot[]]), policy)
      .default({})
      .transform((v) => ({ ...AI_CRAWLERS, ...v })),
    llmsTxt: z.string().max(20_000).default(''),
    feedEnabled: z.boolean().default(false),
    organization: z
      .object({
        foundingYear: z.number().int().min(1900).max(2100).nullable().default(null),
        serviceAreas: z.array(plainText(60)).max(30).default([]),
        specialties: z.array(plainText(60)).max(30).default([]),
        googleBusinessUrl: optionalHttpUrl,
      })
      .strict()
      .default({}),
  })
  .strict();
