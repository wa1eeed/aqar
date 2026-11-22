import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { MediaService } from './media.service.js';
import { RequirePermissions } from '../auth/decorators.js';

const presignBody = z.object({ contentType: z.string().min(3), kind: z.enum(['photo', 'floor_plan', 'document']).optional() });

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

  @Post(':mediaId/cover')
  cover(@Param('mediaId') mediaId: string) {
    return this.svc.setCover(mediaId);
  }

  @Delete(':mediaId')
  remove(@Param('mediaId') mediaId: string) {
    return this.svc.remove(mediaId);
  }
}

const videoBody = z.object({ propertyId: z.number().int(), url: z.string().url() });

// مسار مسطّح يطابق عقد اللوحة: POST /admin/media/video { propertyId, url }.
@ApiTags('admin:media')
@RequirePermissions('properties.edit')
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly svc: MediaService) {}

  @Post('video')
  addVideo(@Body() body: unknown) {
    const { propertyId, url } = videoBody.parse(body);
    return this.svc.addVideo(propertyId, url);
  }
}
