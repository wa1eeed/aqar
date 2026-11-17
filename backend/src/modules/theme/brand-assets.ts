import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppException } from '../../common/errors/app-exception';

export const BRAND_KINDS = ['logo', 'logoLight', 'favicon', 'social', 'email'] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];
export const FAVICON_SIZES = [16, 32, 180, 192, 512] as const;
/** Public file names under /brand/ — anything else is refused by the route. */
export const BRAND_FILE = /^[a-z0-9-]{3,80}\.(png|jpg|webp|svg)$/;

export interface BrandFile {
  name: string;
  body: Buffer;
  type: string;
}

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', 400, msg, { fields: { file: 'invalid_file' } });

function kindOf(buf: Buffer): 'png' | 'jpg' | 'webp' | 'svg' | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'webp';
  const head = buf.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

/** SVG logos may not carry scripts, event handlers, external references or embedded HTML. */
function assertSafeSvg(text: string) {
  if (
    /<script|<foreignobject|\bon[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']?(?!#)|href\s*=\s*["']?(?!#)/i.test(
      text,
    )
  ) {
    throw invalid('ملف SVG يحتوي على عناصر غير مسموحة');
  }
}

/**
 * Validates and normalises an uploaded brand asset (docs/07 §10.1). Raster files are re-encoded
 * (metadata removed); the favicon source must be square ≥ 512 px and yields 16/32/180/192/512 PNGs.
 * File names carry a content hash so they can be cached forever.
 */
export async function processBrandAsset(kind: BrandKind, buf: Buffer): Promise<{ url: string; files: BrandFile[] }> {
  const type = kindOf(buf);
  if (!type) throw invalid('نوع الملف غير مدعوم (PNG أو JPG أو WebP أو SVG)');
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const slug = kind === 'logoLight' ? 'logo-light' : kind;

  if (type === 'svg') {
    if (kind === 'favicon' || kind === 'social') throw invalid('هذا الحقل يتطلب صورة PNG أو JPG');
    assertSafeSvg(buf.toString('utf8'));
    const name = `${slug}-${hash}.svg`;
    return { url: `/brand/${name}`, files: [{ name, body: buf, type: 'image/svg+xml' }] };
  }

  const img = sharp(buf, { failOn: 'error' }).rotate();
  const meta = await img.metadata().catch(() => {
    throw invalid('تعذّرت قراءة الصورة');
  });
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (kind === 'favicon') {
    if (w < 512 || h < 512 || Math.abs(w - h) > 2)
      throw invalid('أيقونة الموقع يجب أن تكون مربعة بمقاس 512 بكسل على الأقل');
    const files = await Promise.all(
      FAVICON_SIZES.map(async (size) => ({
        name: `favicon-${hash}-${size}.png`,
        body: await sharp(buf).resize(size, size, { fit: 'cover' }).png().toBuffer(),
        type: 'image/png',
      })),
    );
    return { url: `/brand/favicon-${hash}-512.png`, files };
  }
  if (kind === 'social') {
    const body = await img.resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    const name = `social-${hash}.jpg`;
    return { url: `/brand/${name}`, files: [{ name, body, type: 'image/jpeg' }] };
  }
  const body = await img.resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const name = `${slug}-${hash}.png`;
  return { url: `/brand/${name}`, files: [{ name, body, type: 'image/png' }] };
}

/** /brand/favicon-<hash>-512.png → the URL of another generated size. */
export function faviconSize(url: string, size: number): string {
  return url.replace(/-512\.png$/, `-${size}.png`);
}
