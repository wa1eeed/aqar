import { z } from 'zod';

export const seoSchema = z.object({
  siteName: z.string().default('عقار أونلاين'),
  titleTemplate: z.string().default('{page} | {brand}'),
  defaultDescription: z.string().default(''),
  canonicalDomain: z.string().default(''),
  defaultOgImageKey: z.string().nullable().default(null),
  xHandle: z.string().default(''),
  language: z.string().default('ar-SA'),
  indexable: z.boolean().default(true),
  verification: z
    .object({
      google: z.string().default(''),
      bing: z.string().default(''),
      yandex: z.string().default(''),
    })
    .default({}),
  analytics: z
    .object({
      ga4: z.string().default(''),
      gtm: z.string().default(''),
      metaPixel: z.string().default(''),
      snapPixel: z.string().default(''),
      tiktokPixel: z.string().default(''),
    })
    .default({}),
  templates: z
    .object({
      propertyTitle: z
        .string()
        .default('{type} {offer} في حي {district}، {city} — {area} م² | {brand}'),
      propertyDescription: z
        .string()
        .default('{type} {offer} في {district} بمساحة {area} م². {firstSentence}'),
      listingTitle: z.string().default('{type_plural} {offer} في {city} | {brand}'),
    })
    .default({}),
  summaryTemplate: z
    .string()
    .default('{type} {offer} في حي {district} ب{city}، المساحة {area} م²، السعر {price}، الحالة: {status}'),
  // سياسة روبوتات الذكاء الاصطناعي (docs/07 §11.7): true = السماح.
  crawlerPolicy: z
    .record(z.boolean())
    .default({
      GPTBot: true,
      'OAI-SearchBot': true,
      'ChatGPT-User': true,
      ClaudeBot: true,
      'Claude-User': true,
      PerplexityBot: true,
      'Google-Extended': false,
      'Applebot-Extended': false,
      CCBot: false,
      Bytespider: false,
      Amazonbot: true,
    }),
  llmsTxt: z.string().default(''),
  feedEnabled: z.boolean().default(false),
  metaKeywordsTag: z.boolean().default(false),
});

export type SeoSettings = z.infer<typeof seoSchema>;
