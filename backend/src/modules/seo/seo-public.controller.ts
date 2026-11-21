import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SeoService } from './seo.service.js';
import { Public } from '../auth/decorators.js';

@ApiTags('seo')
@Public()
@Controller()
export class SeoPublicController {
  constructor(private readonly seo: SeoService) {}

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots() {
    return this.seo.robotsTxt();
  }

  @Get('llms.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  llms() {
    return this.seo.llmsTxt();
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemap() {
    return this.seo.sitemapIndex();
  }

  @Get('sitemap-properties.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemapProperties() {
    return this.seo.sitemapProperties();
  }

  @Get('sitemap-pages.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemapPages() {
    return this.seo.sitemapPages();
  }

  @Get('feeds/properties.json')
  @Header('Cache-Control', 'public, max-age=1800')
  feed() {
    return this.seo.feed();
  }

  @Get('property/:idSlug')
  async property(@Param('idSlug') idSlug: string, @Res() res: Response) {
    const r = await this.seo.renderProperty(idSlug);
    if (r.status === 301 && r.redirect) return res.redirect(301, r.redirect);
    if (r.status === 200 && r.html) return res.status(200).type('html').send(r.html);
    return res.status(r.status).type('html').send(r.status === 410 ? 'العقار لم يعد متاحاً' : 'غير موجود');
  }
}
