import { z } from 'zod';

export const notificationsSchema = z.object({
  senderName: z.string().default('منزلة'),
  leadRouting: z
    .object({
      strategy: z.enum(['round_robin', 'manual', 'by_city']).default('round_robin'),
      fallbackUserId: z.string().nullable().default(null),
    })
    .default({}),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: z.string().default('22:00'),
      end: z.string().default('08:00'),
    })
    .default({}),
  // تجاوزات القنوات الافتراضية لكل حدث (eventKey -> قنوات)؛ الافتراضي من docs/06.
  defaultChannels: z
    .record(z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() }))
    .default({}),
  emailTemplateOverrides: z
    .array(
      z.object({
        template: z.string(),
        subject: z.string().optional(),
        enabled: z.boolean().default(true),
      }),
    )
    .default([]),
});

export type NotificationsSettings = z.infer<typeof notificationsSchema>;
