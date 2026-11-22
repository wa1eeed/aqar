import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { IntegrationsService } from '../integrations/integrations.service.js';

const MAX_BYTES = 10 * 1024 * 1024;

// ملاحظة: توليد المتغيّرات (sharp) يتم في عامل خلفي لاحقاً؛ هنا presign + سجلّ الوسيط.
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly integrations: IntegrationsService,
  ) {}

  private async requireProperty(propertyId: number) {
    const p = await this.prisma.scoped.property.findFirst({ where: { id: propertyId }, select: { id: true } });
    if (!p) throw new NotFoundException('العقار غير موجود');
  }

  async presign(propertyId: number, contentType: string, kind = 'photo') {
    const tenantId = this.tenant.requireTenantId();
    await this.requireProperty(propertyId);
    const ext = (contentType.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '');
    const key = `tenants/${tenantId}/properties/${propertyId}/${randomUUID()}.${ext}`;
    const { url, headers } = await this.integrations.presignPut('uploads', key, contentType, MAX_BYTES);
    const media = await this.prisma.scoped.propertyMedia.create({
      data: { tenantId, propertyId, kind: kind as never, originalKey: key, status: 'processing' },
    });
    return { mediaId: media.id, uploadUrl: url, headers, key };
  }

  list(propertyId: number) {
    return this.prisma.scoped.propertyMedia.findMany({ where: { propertyId }, orderBy: { sort: 'asc' } });
  }

  /** يربط رابط فيديو خارجي (يوتيوب…) بالعقار. */
  async addVideo(propertyId: number, url: string) {
    const tenantId = this.tenant.requireTenantId();
    await this.requireProperty(propertyId);
    return this.prisma.scoped.propertyMedia.create({
      data: { tenantId, propertyId, kind: 'video_url', externalUrl: url, status: 'ready' },
    });
  }

  async remove(mediaId: string) {
    const m = await this.prisma.scoped.propertyMedia.findFirst({ where: { id: mediaId } });
    if (!m) throw new NotFoundException('الوسيط غير موجود');
    if (m.originalKey) await this.integrations.deleteObject('uploads', m.originalKey).catch(() => undefined);
    await this.prisma.scoped.propertyMedia.delete({ where: { id: mediaId } });
    return { deleted: true };
  }

  async setCover(mediaId: string) {
    const m = await this.prisma.scoped.propertyMedia.findFirst({ where: { id: mediaId } });
    if (!m) throw new NotFoundException('الوسيط غير موجود');
    await this.prisma.scoped.propertyMedia.updateMany({ where: { propertyId: m.propertyId }, data: { isCover: false } });
    await this.prisma.scoped.propertyMedia.update({ where: { id: mediaId }, data: { isCover: true } });
    return { ok: true };
  }
}
