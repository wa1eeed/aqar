import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';

// مسارات المنصّة (بلا مشترك) وكلمات محجوزة لا تصلح slugs لمشترك.
const PLATFORM_PATH = /^\/api\/v1\/(super|platform)(\/|$)/;
export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'super', 'platform', 'assets', 'static', 't',
  'theme.css', 'robots.txt', 'sitemap.xml', 'llms.txt', 'feeds', 'favicon.ico',
]);

/**
 * يحدّد المشترك للطلب ويُشغّل بقيّته داخل TenantContext:
 *  1) مسار /api/v1/super|platform → سياق المنصّة (بلا مشترك).
 *  2) ترويسة X-Tenant (slug أو id) — يضبطها gateway/الواجهة.
 *  3) النطاق (Host): نطاق مخصّص/فرعي عبر TenantDomain أو <slug>.<base>.
 *  4) أول جزء من المسار (/t/<slug> أو /<slug>) مع تجاهل المحجوزات.
 * عند عدم التحديد يبقى tenantId=null، فتفشل استعلامات النماذج المملوكة (عزل آمن افتراضياً).
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (PLATFORM_PATH.test(req.path)) {
      return this.ctx.run({ tenantId: null, platform: true }, () => next());
    }
    const key = this.candidateKey(req);
    let tenantId: string | null = null;
    if (key) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [{ slug: key }, { id: key }],
          status: { not: 'cancelled' },
          deletedAt: null,
        },
        select: { id: true },
      });
      tenantId = tenant?.id ?? null;
      // مُعرِّف مشترك صريح قُدِّم لكنّه لم يُطابق أيّ مكتب → 404 نظيف (بدل فشل الاستعلام بـ 500).
      if (!tenantId) {
        return next(new NotFoundException('المكتب (المشترك) غير موجود'));
      }
      res.setHeader('x-tenant-id', tenantId);
    }
    return this.ctx.run({ tenantId, platform: false }, () => next());
  }

  private candidateKey(req: Request): string | null {
    const header = req.header('x-tenant');
    if (header) return header.trim();

    const host = (req.header('x-forwarded-host') ?? req.header('host') ?? '').split(':')[0];
    const base = process.env.PLATFORM_BASE_DOMAIN;
    if (base && host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -1 * (base.length + 1));
      if (sub && !RESERVED_SLUGS.has(sub)) return sub;
    }

    // أول جزء من المسار: /t/<slug> أو /<slug>
    const segments = req.path.split('/').filter(Boolean);
    const first = segments[0] === 't' ? segments[1] : segments[0];
    if (first && !RESERVED_SLUGS.has(first)) return first;
    return null;
  }
}
