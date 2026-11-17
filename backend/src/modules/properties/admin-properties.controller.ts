import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import type { AuthUser } from '../auth/auth.types';
import { CreatePropertyDto, StatusDto, UpdatePropertyDto } from './dto';
import { PropertiesService } from './properties.service';
import { listQuerySchema } from './query';

class AdminListQuery extends createZodDto(
  listQuerySchema.extend({
    visibility: z.enum(['draft', 'published', 'archived']).optional(),
    agentId: z.string().max(40).optional(),
    license: z.enum(['missing', 'expiring', 'expired']).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}

/** docs/02 §6 Properties [properties.*]; agents act on their own listings only (docs/03). */
@ApiTags('admin/properties')
@Controller('admin/properties')
export class AdminPropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Staff('properties.view')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: AdminListQuery) {
    return this.properties.list(user, q);
  }

  @Staff('properties.create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePropertyDto) {
    return this.properties.create(user, body);
  }

  @Staff('properties.view')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.get(user, id);
  }

  @Staff('properties.edit')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: UpdatePropertyDto) {
    return this.properties.update(user, id, body);
  }

  @Staff('properties.delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.properties.remove(user, id);
  }

  @Staff('properties.status')
  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: StatusDto) {
    return this.properties.changeStatus(user, id, body.status, body.reason);
  }

  @Staff('properties.publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.publish(user, id);
  }

  @Staff('properties.publish')
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.unpublish(user, id);
  }

  @Staff('properties.create')
  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.duplicate(user, id);
  }

  @Staff('properties.edit')
  @Post(':id/rega-check')
  @HttpCode(200)
  regaCheck() {
    // gov.rega is a prepared integration (docs/05 §3): available once the company receives REGA access.
    throw new AppException('PROVIDER_NOT_READY', 422, 'التحقق من الهيئة متاح بعد ربط تكامل الهيئة العامة للعقار');
  }

  @Staff('properties.view')
  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.history(user, id);
  }
}
