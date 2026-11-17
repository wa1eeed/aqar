import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { CreateViewingDto, UpdateViewingDto, ViewingsQueryDto } from './dto';
import { ViewingsService } from './viewings.service';

/** docs/02 §6 Viewings [viewings.manage]. */
@ApiTags('admin/viewings')
@Controller('admin/viewings')
export class ViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  /** Viewings in a date range (max 62 days) for the calendar; agents see their own. */
  @Staff('viewings.manage')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ViewingsQueryDto) {
    return this.viewings.list(user, q);
  }

  /** Schedule a viewing (optionally from a lead); confirmed viewings notify the customer. */
  @Staff('viewings.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() b: CreateViewingDto) {
    return this.viewings.create(user, b);
  }

  /** One viewing. */
  @Staff('viewings.manage')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.viewings.get(user, id);
  }

  /** Reschedule, reassign or change the status of a viewing; confirmation notifies the customer. */
  @Staff('viewings.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: UpdateViewingDto) {
    return this.viewings.update(user, id, b);
  }
}
