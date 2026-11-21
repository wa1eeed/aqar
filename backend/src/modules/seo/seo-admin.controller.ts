import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SeoAdminService } from './seo-admin.service.js';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('admin:seo')
@RequirePermissions('seo.manage')
@Controller('admin/seo')
export class SeoAdminController {
  constructor(private readonly svc: SeoAdminService) {}

  @Get('pages/:key') getPage(@Param('key') key: string) {
    return this.svc.getPageMeta(key);
  }
  @Put('pages/:key') setPage(@Param('key') key: string, @Body() body: unknown) {
    return this.svc.setPageMeta(key, body);
  }

  @Get('landing-pages') listLanding() {
    return this.svc.listLanding();
  }
  @Post('landing-pages') createLanding(@Body() body: unknown) {
    return this.svc.createLanding(body);
  }
  @Patch('landing-pages/:id') updateLanding(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateLanding(id, body);
  }
  @Delete('landing-pages/:id') deleteLanding(@Param('id') id: string) {
    return this.svc.deleteLanding(id);
  }

  @Get('faqs') listFaq() {
    return this.svc.listFaq();
  }
  @Post('faqs') createFaq(@Body() body: unknown) {
    return this.svc.createFaq(body);
  }
  @Patch('faqs/:id') updateFaq(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateFaq(id, body);
  }
  @Delete('faqs/:id') deleteFaq(@Param('id') id: string) {
    return this.svc.deleteFaq(id);
  }

  @Get('keywords') listKeywords() {
    return this.svc.listKeywords();
  }
  @Post('keywords') createKeyword(@Body() body: unknown) {
    return this.svc.createKeyword(body);
  }
  @Delete('keywords/:id') deleteKeyword(@Param('id') id: string) {
    return this.svc.deleteKeyword(id);
  }

  @Get('redirects') listRedirects() {
    return this.svc.listRedirects();
  }
  @Post('redirects') createRedirect(@Body() body: unknown) {
    return this.svc.createRedirect(body);
  }
  @Delete('redirects/:id') deleteRedirect(@Param('id') id: string) {
    return this.svc.deleteRedirect(id);
  }

  @Get('404s') list404s() {
    return this.svc.list404s();
  }
}
