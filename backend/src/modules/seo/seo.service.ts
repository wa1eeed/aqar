import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { schemaData } from '@manzilah/schema';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { halalasToSar } from '../../common/money.js';
import { breadcrumbLd, realEstateListingLd, scriptTag } from './jsonld.js';

const PROPERTY_HTML = resolve(process.cwd(), '../frontend/property.html');

interface SsrResult {
  status: number;
  html?: string;
  redirect?: string;
}

@Injectable()
export class SeoService {
  private propertyTemplate: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private base(): string {
    return this.config.get<string>('PUBLIC_URL') ?? '';
  }

  // ───────────────── robots / llms ─────────────────
  async robotsTxt(): Promise<string> {
    const seo = (await this.settings.get('seo')) as { indexable: boolean; crawlerPolicy: Record<string, boolean> };
    const base = this.base();
    const lines = ['User-agent: *', seo.indexable ? 'Allow: /' : 'Disallow: /', ''];
    for (const [bot, allow] of Object.entries(seo.crawlerPolicy)) {
      lines.push(`User-agent: ${bot}`, allow ? 'Allow: /' : 'Disallow: /', '');
    }
    if (base) lines.push(`Sitemap: ${base}/sitemap.xml`);
    return lines.join('\n') + '\n';
  }

  async llmsTxt(): Promise<string> {
    const seo = (await this.settings.get('seo')) as { llmsTxt: string; siteName: string };
    if (seo.llmsTxt?.trim()) return seo.llmsTxt;
    const branding = (await this.settings.get('branding')) as { fullName: string };
    return `# ${branding.fullName}\n\n> منصة عقارية سعودية.\n\nURLs:\n- ${this.base()}/properties\n`;
  }

  // ───────────────── sitemaps ─────────────────
  private urlset(urls: { loc: string; lastmod?: string }[]): string {
    const items = urls
      .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
  }

  async sitemapIndex(): Promise<string> {
    const base = this.base();
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${base}/sitemap-properties.xml</loc></sitemap>\n  <sitemap><loc>${base}/sitemap-pages.xml</loc></sitemap>\n</sitemapindex>\n`;
  }

  async sitemapProperties(): Promise<string> {
    const base = this.base();
    const props = await this.prisma.scoped.property.findMany({
      where: { visibility: 'published', deletedAt: null, noindex: false },
      select: { id: true, slug: true, updatedAt: true },
      take: 50_000,
    });
    return this.urlset(props.map((p) => ({ loc: `${base}/property/${p.id}-${p.slug}`, lastmod: p.updatedAt.toISOString().slice(0, 10) })));
  }

  async sitemapPages(): Promise<string> {
    const base = this.base();
    const pages = ['', 'properties', 'about', 'contact'];
    return this.urlset(pages.map((p) => ({ loc: `${base}/${p}` })));
  }

  // ───────────────── feed ─────────────────
  async feed(): Promise<unknown> {
    const base = this.base();
    const props = await this.prisma.scoped.property.findMany({
      where: { visibility: 'published', deletedAt: null },
      select: { id: true, slug: true, title: true, offer: true, type: true, price: true, area: true, cityId: true },
      take: 1000,
      orderBy: { createdAt: 'desc' },
    });
    return {
      generatedAt: new Date().toISOString(),
      properties: props.map((p) => ({
        url: `${base}/property/${p.id}-${p.slug}`,
        title: p.title,
        type: p.type,
        offer: p.offer,
        priceSar: halalasToSar(p.price),
        area: p.area,
        city: p.cityId,
      })),
    };
  }

  // ───────────────── property SSR ─────────────────
  async renderProperty(idSlug: string): Promise<SsrResult> {
    const m = idSlug.match(/^(\d+)/);
    if (!m) return { status: 404 };
    const id = Number(m[1]);
    const p = await this.prisma.scoped.property.findFirst({
      where: { id },
      include: { city: true, district: true, media: true },
    });
    if (!p) return { status: 404 };
    if (p.deletedAt) return { status: 410 };
    if (p.visibility !== 'published') return { status: 404 };

    const canonicalPath = `/property/${p.id}-${p.slug}`;
    if (idSlug !== `${p.id}-${p.slug}`) return { status: 301, redirect: canonicalPath };

    const [seo, branding] = (await Promise.all([this.settings.get('seo'), this.settings.get('branding')])) as [
      { templates: { propertyTitle: string }; defaultDescription: string },
      { fullName: string },
    ];
    const typeLabel = schemaData.types[p.type]?.label ?? p.type;
    const offerLabel = schemaData.offers[p.offer as 'sale']?.label ?? p.offer;
    const tokens: Record<string, string> = {
      type: typeLabel,
      offer: offerLabel,
      district: p.district?.nameAr ?? '',
      city: p.city?.nameAr ?? p.cityId,
      area: String(p.area),
      brand: branding.fullName,
    };
    const title = p.seoTitle || this.renderTemplate(seo.templates.propertyTitle, tokens);
    const desc = p.seoDescription || p.description.slice(0, 160);
    const url = this.base() + canonicalPath;
    const images = (p.media ?? [])
      .filter((mm) => mm.kind === 'photo')
      .map((mm) => (mm.variants as Record<string, string> | null)?.card ?? mm.externalUrl ?? '')
      .filter(Boolean);

    const ld = [
      realEstateListingLd({
        name: title,
        description: desc,
        url,
        images,
        priceSar: halalasToSar(p.price),
        area: p.area,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        districtName: tokens.district,
        cityLabel: tokens.city,
      }),
      breadcrumbLd([
        { name: 'الرئيسية', url: this.base() + '/' },
        { name: 'العقارات', url: this.base() + '/properties' },
        { name: title, url },
      ]),
    ];

    const html = this.inject(title, desc, url, images[0] ?? '', ld.map(scriptTag).join(''), p.noindex);
    return { status: 200, html };
  }

  private renderTemplate(tpl: string, tokens: Record<string, string>): string {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? '');
  }

  private template(): string {
    if (this.propertyTemplate == null) this.propertyTemplate = readFileSync(PROPERTY_HTML, 'utf8');
    return this.propertyTemplate;
  }

  private inject(title: string, desc: string, canonical: string, ogImage: string, ldScripts: string, noindex: boolean): string {
    const esc = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const head =
      `<link rel="canonical" href="${canonical}">` +
      `<meta property="og:title" content="${esc(title)}">` +
      `<meta property="og:description" content="${esc(desc)}">` +
      `<meta property="og:type" content="website">` +
      `<meta property="og:url" content="${canonical}">` +
      (ogImage ? `<meta property="og:image" content="${ogImage}">` : '') +
      (noindex ? '<meta name="robots" content="noindex">' : '') +
      `<link rel="stylesheet" href="/theme.css">` +
      ldScripts;
    return this.template()
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`)
      .replace('</head>', head + '</head>');
  }
}
