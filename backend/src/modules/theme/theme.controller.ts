import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { FileStore } from '../payments/file-store.service';
import { SettingsService } from '../settings/settings.service';
import { BRAND_FILE, BRAND_KINDS, faviconSize, processBrandAsset, type BrandKind } from './brand-assets';
import { ThemeService } from './theme.service';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

/** Site-level assets served outside /api/v1 (docs/02 §8): theme, web manifest, brand files. */
@ApiTags('site')
@Controller()
export class ThemeController {
  constructor(
    private readonly theme: ThemeService,
    private readonly settings: SettingsService,
    private readonly files: FileStore,
  ) {}

  /** Generated theme variables + font import; immutable when requested with the current `?v=`. */
  @Public()
  @Get('theme.css')
  async css(@Query('v') v: string | undefined, @Res() res: Response) {
    const { css, version } = await this.theme.current();
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.setHeader('ETag', `"${version}"`);
    res.setHeader(
      'Cache-Control',
      v === version ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    );
    if (res.req.headers['if-none-match'] === `"${version}"`) return res.status(304).end();
    res.send(css);
  }

  /** Web app manifest built from the branding settings (name, colours, generated icons). */
  @Public()
  @Get('site.webmanifest')
  @Header('Content-Type', 'application/manifest+json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async manifest() {
    const b = await this.settings.get('branding');
    const icon = b.faviconUrl && b.faviconUrl.startsWith('/brand/') ? b.faviconUrl : null;
    return {
      name: b.fullName,
      short_name: b.name,
      lang: 'ar',
      dir: 'rtl',
      start_url: '/',
      display: 'browser',
      theme_color: b.theme.primary,
      background_color: b.theme.background,
      icons: icon
        ? [192, 512].map((s) => ({ src: faviconSize(icon, s), sizes: `${s}x${s}`, type: 'image/png' }))
        : [{ src: '/assets/img/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    };
  }

  /** Uploaded brand files (logos, favicon sizes, share image); content-hashed names, cached forever. */
  @Public()
  @Get('brand/:file')
  async brandFile(@Param('file') file: string, @Res() res: Response) {
    if (!BRAND_FILE.test(file)) throw new AppException('NOT_FOUND', 404, 'الملف غير موجود');
    const body = await this.files.get(`brand/${file}`).catch(() => {
      throw new AppException('NOT_FOUND', 404, 'الملف غير موجود');
    });
    res.setHeader('Content-Type', TYPES[file.split('.').pop()!]!);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // Brand images are shown on the site and the admin (same origin); SVGs can never run scripts.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.send(body);
  }
}

/** Brand asset uploads for «الهوية والمظهر» (docs/07 §10.1). */
@ApiTags('admin/settings')
@Controller('admin/settings/branding')
export class BrandAssetsController {
  constructor(
    private readonly files: FileStore,
    private readonly audit: AuditService,
  ) {}

  /** Upload a logo, dark-background logo, favicon (→ 16/32/180/192/512 PNG), share image or email logo; returns its URL to save in the settings. */
  @Staff('settings.branding')
  @RateLimit({ name: 'brand-upload', limit: 30, windowSec: 3600, by: 'ip' })
  @HttpCode(200)
  @Post('assets/:kind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!(BRAND_KINDS as readonly string[]).includes(kind)) throw new AppException('NOT_FOUND', 404, 'النوع غير معروف');
    if (!file) throw new AppException('VALIDATION_FAILED', 400, 'اختر ملفاً', { fields: { file: 'Required' } });
    const out = await processBrandAsset(kind as BrandKind, file.buffer);
    for (const f of out.files) await this.files.put(`brand/${f.name}`, f.body, f.type);
    await this.audit.record({
      action: 'settings.brand_asset_upload',
      entityType: 'settings',
      entityId: 'branding',
      after: { kind, url: out.url },
      actor: { type: 'staff', id: user.id },
    });
    return { url: out.url };
  }
}
