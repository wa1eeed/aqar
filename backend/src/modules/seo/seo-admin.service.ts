import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';

const pageMetaSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  focusKeyword: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  noindex: z.boolean().optional(),
});
const landingSchema = z.object({
  path: z.string().min(1),
  filters: z.record(z.unknown()),
  h1: z.string().min(1),
  introHtml: z.string().default(''),
  faqIds: z.array(z.string()).optional(),
  focusKeyword: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  indexable: z.boolean().optional(),
  inSitemap: z.boolean().optional(),
});
const faqSchema = z.object({
  question: z.string().min(2),
  answerShort: z.string().min(2),
  answerHtml: z.string().optional(),
  scope: z.array(z.string()).default([]),
  sort: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const keywordSchema = z.object({
  keyword: z.string().min(1),
  intent: z.enum(['informational', 'commercial', 'local', 'transactional']),
  group: z.string().optional(),
  targetPath: z.string().optional(),
  priority: z.number().int().min(1).max(3).optional(),
  notes: z.string().optional(),
});
const redirectSchema = z.object({ fromPath: z.string().min(1), toPath: z.string().min(1), code: z.number().int().optional() });

@Injectable()
export class SeoAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  // Pages meta (مفتاح مركّب)
  async getPageMeta(key: string) {
    const tenantId = this.tenant.requireTenantId();
    return (await this.prisma.seoPageMeta.findUnique({ where: { tenantId_key: { tenantId, key } } })) ?? { key };
  }
  async setPageMeta(key: string, input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const data = pageMetaSchema.parse(input);
    return this.prisma.seoPageMeta.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, ...data, keywords: data.keywords ?? [] },
      update: data,
    });
  }

  // Landing pages
  listLanding() {
    return this.prisma.scoped.seoLandingPage.findMany({ orderBy: { createdAt: 'desc' } });
  }
  createLanding(input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const d = landingSchema.parse(input);
    return this.prisma.scoped.seoLandingPage.create({
      data: { tenantId, path: d.path, filters: d.filters as Prisma.InputJsonValue, h1: d.h1, introHtml: d.introHtml, faqIds: d.faqIds ?? [], focusKeyword: d.focusKeyword, metaTitle: d.metaTitle, metaDescription: d.metaDescription, indexable: d.indexable ?? true, inSitemap: d.inSitemap ?? true },
    });
  }
  async updateLanding(id: string, input: unknown) {
    const d = landingSchema.partial().parse(input);
    await this.prisma.scoped.seoLandingPage.updateMany({
      where: { id },
      data: { path: d.path, h1: d.h1, introHtml: d.introHtml, faqIds: d.faqIds, focusKeyword: d.focusKeyword, metaTitle: d.metaTitle, metaDescription: d.metaDescription, indexable: d.indexable, inSitemap: d.inSitemap, ...(d.filters ? { filters: d.filters as Prisma.InputJsonValue } : {}) },
    });
    return { ok: true };
  }
  deleteLanding(id: string) {
    return this.prisma.scoped.seoLandingPage.deleteMany({ where: { id } }).then(() => ({ ok: true }));
  }

  // FAQ
  listFaq() {
    return this.prisma.scoped.seoFaq.findMany({ orderBy: { sort: 'asc' } });
  }
  createFaq(input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const d = faqSchema.parse(input);
    return this.prisma.scoped.seoFaq.create({ data: { tenantId, ...d } });
  }
  async updateFaq(id: string, input: unknown) {
    const d = faqSchema.partial().parse(input);
    await this.prisma.scoped.seoFaq.updateMany({ where: { id }, data: d });
    return { ok: true };
  }
  deleteFaq(id: string) {
    return this.prisma.scoped.seoFaq.deleteMany({ where: { id } }).then(() => ({ ok: true }));
  }

  // Keywords
  listKeywords() {
    return this.prisma.scoped.seoKeyword.findMany({ orderBy: { priority: 'asc' } });
  }
  createKeyword(input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const d = keywordSchema.parse(input);
    return this.prisma.scoped.seoKeyword.create({ data: { tenantId, ...d, priority: d.priority ?? 2 } });
  }
  deleteKeyword(id: string) {
    return this.prisma.scoped.seoKeyword.deleteMany({ where: { id } }).then(() => ({ ok: true }));
  }

  // Redirects + 404 log
  listRedirects() {
    return this.prisma.scoped.seoRedirect.findMany({ orderBy: { createdAt: 'desc' } });
  }
  createRedirect(input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const d = redirectSchema.parse(input);
    return this.prisma.scoped.seoRedirect.create({ data: { tenantId, fromPath: d.fromPath, toPath: d.toPath, code: d.code ?? 301 } });
  }
  deleteRedirect(id: string) {
    return this.prisma.scoped.seoRedirect.deleteMany({ where: { id } }).then(() => ({ ok: true }));
  }
  list404s() {
    return this.prisma.scoped.seo404.findMany({ orderBy: { hits: 'desc' }, take: 200 });
  }
}
