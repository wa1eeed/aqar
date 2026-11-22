import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';

const BRANDING_KEY = 'branding';

// علامة المنصة وإعدادات SEO (يحرّرها السوبر-أدمن، تُستهلك في الموقع التسويقي).
export const brandingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(160).default(''),
  description: z.string().trim().max(400).default(''),
  keywords: z.string().trim().max(600).default(''),
  logoUrl: z.string().trim().max(400).default(''),
  faviconUrl: z.string().trim().max(400).default(''),
  ogImageUrl: z.string().trim().max(400).default(''),
  email: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(40).default(''),
  twitter: z.string().trim().max(80).default(''),
});
export type Branding = z.infer<typeof brandingSchema>;

export const DEFAULT_BRANDING: Branding = {
  name: 'عقار أونلاين',
  tagline: 'نظام التشغيل المتكامل لمكاتب ووسطاء العقار',
  description:
    'منصة سعودية متكاملة لإدارة المكاتب والوسطاء العقاريين: عقارات، حجوزات، مدفوعات، عملاء، وموقع إلكتروني بنطاقك.',
  keywords:
    'منصة عقارية, نظام إدارة عقارات, برنامج مكاتب عقارية, CRM عقاري, إدارة الوسطاء العقاريين, عقار أونلاين, عقارات السعودية, رخصة فال',
  logoUrl: '/assets/img/favicon.svg',
  faviconUrl: '/assets/img/favicon.svg',
  ogImageUrl: '/assets/img/og.jpg',
  email: 'info@aqaar.online',
  phone: '',
  twitter: '',
};

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBranding(): Promise<Branding> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: BRANDING_KEY } });
    if (!row) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...(row.value as Record<string, unknown>) } as Branding;
  }

  async updateBranding(input: unknown): Promise<Branding> {
    const data = brandingSchema.parse({ ...DEFAULT_BRANDING, ...(input as Record<string, unknown>) });
    await this.prisma.platformSetting.upsert({
      where: { key: BRANDING_KEY },
      create: { key: BRANDING_KEY, value: data },
      update: { value: data },
    });
    return data;
  }
}
