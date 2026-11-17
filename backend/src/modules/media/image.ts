import sharp from 'sharp';

/** docs/10 §7: thumb 480, card 960, full 1920; WebP + JPEG fallback. */
export const SIZES = { thumb: 480, card: 960, full: 1920 } as const;
export const MAX_PIXELS = 12_000 * 12_000;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class InvalidImageError extends Error {}

export interface Rendition {
  name: keyof typeof SIZES;
  format: 'jpg' | 'webp';
  body: Buffer;
}

/**
 * Decodes the upload with sharp (the real format check — magic bytes, not the declared type),
 * applies EXIF orientation and strips all metadata (EXIF GPS can reveal where a photo was taken).
 */
export async function renderVariants(
  input: Buffer,
): Promise<{ width: number; height: number; renditions: Rendition[] }> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new InvalidImageError('not an image');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format))
    throw new InvalidImageError(`unsupported format ${meta.format}`);
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 150)
    throw new InvalidImageError('image too small');

  const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate(); // orientation applied, metadata dropped by default
  const renditions: Rendition[] = [];
  for (const [name, width] of Object.entries(SIZES) as Array<[keyof typeof SIZES, number]>) {
    const resized = base.clone().resize({ width, withoutEnlargement: true });
    renditions.push({ name, format: 'webp', body: await resized.clone().webp({ quality: 80 }).toBuffer() });
    renditions.push({
      name,
      format: 'jpg',
      body: await resized.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
    });
  }
  const oriented = await base.clone().metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  return {
    width: swap ? meta.height : (oriented.width ?? meta.width),
    height: swap ? meta.width : (oriented.height ?? meta.height),
    renditions,
  };
}
