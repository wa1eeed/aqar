import { Body, Controller, Delete, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { boundedArray, plainText } from '../../common/security/zod-helpers';
import type { AuthUser } from '../auth/auth.types';
import { MediaService } from './media.service';

class PresignDto extends createZodDto(
  z
    .object({
      propertyId: z.number().int().min(1).max(2_147_483_647),
      kind: z.enum(['photo', 'floor_plan']),
      contentType: z.string().max(60),
      size: z.number().int().min(1),
    })
    .strict(),
) {}
class VideoDto extends createZodDto(
  z.object({ propertyId: z.number().int().min(1).max(2_147_483_647), url: z.string().trim().max(300) }).strict(),
) {}
class MediaPatchDto extends createZodDto(
  z.object({ altAr: plainText(160).nullable().optional(), isCover: z.boolean().optional() }).strict(),
) {}
class ReorderDto extends createZodDto(z.object({ ids: boundedArray(z.string().min(1).max(40), 60) }).strict()) {}

/** docs/02 §6 Media [properties.edit]. */
@ApiTags('admin/media')
@Controller('admin')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Staff('properties.edit')
  @Post('media/presign')
  @HttpCode(200)
  presign(@CurrentUser() user: AuthUser, @Body() body: PresignDto) {
    return this.media.presign(user, body);
  }

  @Staff('properties.edit')
  @Post('media/video')
  video(@CurrentUser() user: AuthUser, @Body() body: VideoDto) {
    return this.media.addVideo(user, body.propertyId, body.url);
  }

  @Staff('properties.edit')
  @Post('media/:id/complete')
  @HttpCode(202)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.complete(user, id);
  }

  @Staff('properties.edit')
  @Patch('media/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: MediaPatchDto) {
    return this.media.update(user, id, body);
  }

  @Staff('properties.edit')
  @Delete('media/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.media.remove(user, id);
  }

  @Staff('properties.edit')
  @Post('properties/:id/media/reorder')
  @HttpCode(204)
  async reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReorderDto,
  ): Promise<void> {
    await this.media.reorder(user, id, body.ids);
  }
}
