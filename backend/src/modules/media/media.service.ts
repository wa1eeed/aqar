import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type PropertyMedia } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { MEDIA_QUEUE } from '../../queue/queue.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { IntegrationsGateway } from '../integrations/gateway.service';
import { PropertiesService } from '../properties/properties.service';
import { ACCEPTED_IMAGE_TYPES, InvalidImageError, renderVariants } from './image';

export const MAX_PHOTOS = 40;
export const MAX_BYTES = 15 * 1024 * 1024; // docs/07 §3: 15 MB each
const EXT: Record<(typeof ACCEPTED_IMAGE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const VIDEO =
  /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}|youtu\.be\/[A-Za-z0-9_-]{6,20}|vimeo\.com\/\d{5,12})(&[A-Za-z0-9=_&-]*)?$/;

export interface MediaJob {
  mediaId: string;
}

const notFound = () => new AppException('NOT_FOUND', 404, 'الملف غير موجود');

/** Media pipeline (docs/07 §3): presign → R2 uploads (private) → worker renders variants → R2 media (CDN). */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntegrationsGateway,
    private readonly audit: AuditService,
    private readonly properties: PropertiesService,
    @Inject(MEDIA_QUEUE) private readonly queue: Queue<MediaJob>,
  ) {}

  private async editableProperty(user: AuthUser, propertyId: number) {
    const p = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { id: true, agentId: true },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    if (user.scope === 'own' && p.agentId !== user.id)
      throw new AppException('FORBIDDEN', 403, 'يمكنك تعديل عقاراتك فقط');
    return p;
  }

  private async editableMedia(user: AuthUser, id: string): Promise<PropertyMedia> {
    const m = await this.prisma.propertyMedia.findUnique({ where: { id } });
    if (!m) throw notFound();
    await this.editableProperty(user, m.propertyId);
    return m;
  }

  async presign(
    user: AuthUser,
    input: { propertyId: number; kind: 'photo' | 'floor_plan'; contentType: string; size: number },
  ) {
    await this.editableProperty(user, input.propertyId);
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(input.contentType)) {
      throw new AppException('VALIDATION_FAILED', 400, 'نوع الملف غير مدعوم (JPG أو PNG أو WebP)', {
        fields: { contentType: 'unsupported_type' },
      });
    }
    if (input.size < 1 || input.size > MAX_BYTES)
      throw new AppException('PAYLOAD_TOO_LARGE', 413, 'حجم الصورة يجب ألا يتجاوز 15 ميجابايت');
    if (!(await this.gateway.storage().isReady()))
      throw new AppException(
        'STORAGE_NOT_CONFIGURED',
        422,
        'فعّل تكامل التخزين (Cloudflare R2) أولاً من صفحة التكاملات',
      );
    const count = await this.prisma.propertyMedia.count({
      where: { propertyId: input.propertyId, kind: { in: ['photo', 'floor_plan'] } },
    });
    if (count >= MAX_PHOTOS) throw new AppException('MEDIA_LIMIT', 422, `الحد الأقصى ${MAX_PHOTOS} صورة لكل عقار`);

    const ext = EXT[input.contentType as keyof typeof EXT];
    const media = await this.prisma.propertyMedia.create({
      data: {
        propertyId: input.propertyId,
        kind: input.kind,
        status: 'processing',
        sort: count,
        isCover: count === 0 && input.kind === 'photo',
      },
    });
    const key = `originals/${input.propertyId}/${media.id}-${randomBytes(6).toString('hex')}.${ext}`;
    await this.prisma.propertyMedia.update({ where: { id: media.id }, data: { originalKey: key } });
    const signed = await this.gateway.storage().presignPut('uploads', key, input.contentType, input.size);
    return { mediaId: media.id, key, uploadUrl: signed.url, headers: signed.headers };
  }

  /** Called by the browser after the PUT finished; processing happens in the worker. */
  async complete(user: AuthUser, id: string) {
    const m = await this.editableMedia(user, id);
    if (!m.originalKey || m.kind === 'video_url') throw new AppException('VALIDATION_FAILED', 400, 'لا يوجد ملف مرفوع');
    await this.queue.add(
      'process',
      { mediaId: id },
      {
        jobId: `media-${id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
    return { id, status: 'processing' };
  }

  async addVideo(user: AuthUser, propertyId: number, url: string) {
    await this.editableProperty(user, propertyId);
    if (!VIDEO.test(url))
      throw new AppException('VALIDATION_FAILED', 400, 'رابط الفيديو يجب أن يكون من YouTube أو Vimeo', {
        fields: { url: 'invalid_video_url' },
      });
    const m = await this.prisma.propertyMedia.create({
      data: { propertyId, kind: 'video_url', externalUrl: url, status: 'ready', sort: 999 },
    });
    await this.properties.invalidatePublic();
    return m;
  }

  /** Worker: renders the variants. Invalid files end as `failed` (no retry). */
  async process(mediaId: string): Promise<void> {
    const m = await this.prisma.propertyMedia.findUnique({ where: { id: mediaId } });
    if (!m?.originalKey) return;
    try {
      const { body } = await this.gateway.storage().get('uploads', m.originalKey, MAX_BYTES);
      const out = await renderVariants(body);
      const variants: Record<string, string> = {};
      for (const r of out.renditions) {
        const key = `p/${m.propertyId}/${m.id}-${r.name}.${r.format}`;
        await this.gateway.storage().put('media', key, r.body, r.format === 'webp' ? 'image/webp' : 'image/jpeg');
        const url = await this.gateway.storage().publicUrl(key);
        variants[r.format === 'webp' ? `webp${r.name[0]!.toUpperCase()}${r.name.slice(1)}` : r.name] = url;
      }
      await this.prisma.propertyMedia.update({
        where: { id: m.id },
        data: { status: 'ready', variants: variants as Prisma.InputJsonValue, width: out.width, height: out.height },
      });
      await this.properties.invalidatePublic();
    } catch (e) {
      if (e instanceof InvalidImageError) {
        await this.prisma.propertyMedia.update({ where: { id: m.id }, data: { status: 'failed' } });
        await this.gateway
          .storage()
          .delete('uploads', m.originalKey)
          .catch(() => undefined);
        this.logger.warn({ mediaId, reason: e.message }, 'media rejected');
        return;
      }
      throw e; // transient: BullMQ retries
    }
  }

  async markFailed(mediaId: string): Promise<void> {
    await this.prisma.propertyMedia.updateMany({
      where: { id: mediaId, status: 'processing' },
      data: { status: 'failed' },
    });
  }

  async update(user: AuthUser, id: string, input: { altAr?: string | null; isCover?: boolean }) {
    const m = await this.editableMedia(user, id);
    await this.prisma.$transaction(async (tx) => {
      if (input.isCover)
        await tx.propertyMedia.updateMany({ where: { propertyId: m.propertyId }, data: { isCover: false } });
      await tx.propertyMedia.update({
        where: { id },
        data: {
          ...(input.altAr !== undefined ? { altAr: input.altAr } : {}),
          ...(input.isCover !== undefined ? { isCover: input.isCover } : {}),
        },
      });
    });
    await this.properties.invalidatePublic();
    return this.prisma.propertyMedia.findUniqueOrThrow({ where: { id } });
  }

  async reorder(user: AuthUser, propertyId: number, ids: string[]): Promise<void> {
    await this.editableProperty(user, propertyId);
    const existing = await this.prisma.propertyMedia.findMany({ where: { propertyId }, select: { id: true } });
    const set = new Set(existing.map((e) => e.id));
    if (ids.length !== set.size || ids.some((i) => !set.has(i)))
      throw new AppException('VALIDATION_FAILED', 400, 'قائمة الترتيب غير مطابقة لملفات العقار');
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.propertyMedia.update({ where: { id }, data: { sort: i } })),
    );
    await this.properties.invalidatePublic();
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const m = await this.editableMedia(user, id);
    await this.prisma.propertyMedia.delete({ where: { id } });
    if (m.originalKey)
      await this.gateway
        .storage()
        .delete('uploads', m.originalKey)
        .catch(() => undefined);
    const v = (m.variants ?? {}) as Record<string, string>;
    for (const url of Object.values(v)) {
      const key = /\/(p\/\d+\/[A-Za-z0-9._-]+)$/.exec(url)?.[1];
      if (key)
        await this.gateway
          .storage()
          .delete('media', key)
          .catch(() => undefined);
    }
    await this.audit.record({
      action: 'media.delete',
      entityType: 'property',
      entityId: String(m.propertyId),
      before: { mediaId: id, kind: m.kind },
    });
    await this.properties.invalidatePublic();
  }
}
