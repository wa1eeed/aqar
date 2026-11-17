import sharp from 'sharp';
import { InvalidImageError, renderVariants } from './image';

async function jpegWithGps(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 15, g: 76, b: 58 } } })
    .jpeg()
    .withMetadata({
      exif: { IFD0: { Copyright: 'secret-owner' }, GPS: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' } } as never,
    })
    .toBuffer();
}

describe('renderVariants', () => {
  it('produces 3 sizes × (webp, jpg), never larger than the source, metadata stripped', async () => {
    const out = await renderVariants(await jpegWithGps(1200, 800));
    expect(out.renditions.map((r) => `${r.name}.${r.format}`)).toEqual([
      'thumb.webp',
      'thumb.jpg',
      'card.webp',
      'card.jpg',
      'full.webp',
      'full.jpg',
    ]);
    const full = await sharp(out.renditions.find((r) => r.name === 'full' && r.format === 'jpg')!.body).metadata();
    expect(full.width).toBe(1200); // withoutEnlargement
    const thumb = await sharp(out.renditions.find((r) => r.name === 'thumb' && r.format === 'webp')!.body).metadata();
    expect(thumb.width).toBe(480);
    for (const r of out.renditions) {
      const m = await sharp(r.body).metadata();
      expect(m.exif).toBeUndefined();
    }
  });

  it('rejects non-images, tiny images and disguised files', async () => {
    await expect(renderVariants(Buffer.from('<svg onload=alert(1)></svg>'))).rejects.toBeInstanceOf(InvalidImageError);
    await expect(renderVariants(Buffer.from('%PDF-1.7 fake'))).rejects.toBeInstanceOf(InvalidImageError);
    await expect(renderVariants(await jpegWithGps(100, 80))).rejects.toBeInstanceOf(InvalidImageError);
    const gif = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    await expect(renderVariants(gif)).rejects.toBeInstanceOf(InvalidImageError);
  });
});
