import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { MediaService } from './media.service.js';
import { RequirePermissions } from '../auth/decorators.js';

const presignBody = z.object({ contentType: z.string().min(3), kind: z.enum(['photo', 'floor_plan', 'document']).optional() });

// مسارات متداخلة تحت العقار (عرض + reorder).
@ApiTags('admin:media')
@RequirePermissions('properties.edit')
@Controller('admin/properties/:id/media')
export class MediaController {
  constructor(private readonly svc: MediaService) {}

  @Get()
  list(@Param('id', ParseIntPipe) id: number) {
    return this.svc.list(id);
  }

  @Post('presign')
  presign(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { contentType, kind } = presignBody.parse(body);
    return this.svc.presign(id, contentType, kind);
  }

  @Post('reorder')
  reorder(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(body);
    return this.svc.reorder(id, ids);
  }
}

const presignFlat = z.object({
  propertyId: z.number().int(),
  contentType: z.string().min(3),
  kind: z.enum(['photo', 'floor_plan', 'document']).optional(),
  size: z.number().int().optional(),
});
const videoBody = z.object({ propertyId: z.number().int(), url: z.string().url() });
const updateBody = z.object({ isCover: z.boolean().optional(), altAr: z.string().nullable().optional() });

// مسار مسطّح يطابق عقد اللوحة: /admin/media/*
@ApiTags('admin:media')
@RequirePermissions('properties.edit')
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly svc: MediaService) {}

  @Post('presign')
  presign(@Body() body: unknown) {
    const { propertyId, contentType, kind } = presignFlat.parse(body);
    return this.svc.presign(propertyId, contentType, kind);
  }

  @Post(':mediaId/complete')
  complete(@Param('mediaId') mediaId: string) {
    return this.svc.complete(mediaId);
  }

  @Patch(':mediaId')
  update(@Param('mediaId') mediaId: string, @Body() body: unknown) {
    return this.svc.update(mediaId, updateBody.parse(body));
  }

  @Delete(':mediaId')
  remove(@Param('mediaId') mediaId: string) {
    return this.svc.remove(mediaId);
  }

  @Post('video')
  addVideo(@Body() body: unknown) {
    const { propertyId, url } = videoBody.parse(body);
    return this.svc.addVideo(propertyId, url);
  }
}
