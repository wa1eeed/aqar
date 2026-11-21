import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ViewingsService } from './viewings.service.js';
import { CurrentUser, RequireCustomer, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const statusSchema = z.object({
  status: z.enum(['completed', 'no_show', 'cancelled']),
  notes: z.string().optional(),
});

@ApiTags('admin:viewings')
@RequirePermissions('viewings.manage')
@Controller('admin/viewings')
export class ViewingsAdminController {
  constructor(private readonly svc: ViewingsService) {}

  @Get()
  list(@Query('from') from: string, @Query('to') to: string, @Query('agentId') agentId: string, @CurrentUser() user: AuthUser) {
    return this.svc.adminList({ from, to, agentId }, user);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.confirm(id, user);
  }

  @Patch(':id')
  setStatus(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { status, notes } = statusSchema.parse(body);
    return this.svc.setStatus(id, status, notes, user);
  }
}

@ApiTags('customer:viewings')
@RequireCustomer()
@Controller('me')
export class CustomerViewingsController {
  constructor(private readonly svc: ViewingsService) {}

  @Get('viewings')
  list(@CurrentUser() user: AuthUser) {
    return this.svc.customerList(user.sub);
  }
}
