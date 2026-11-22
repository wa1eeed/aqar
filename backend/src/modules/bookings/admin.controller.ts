import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BookingsService } from './bookings.service.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const cancelSchema = z.object({ reason: z.string().min(1) });
const extendSchema = z.object({ minutes: z.number().int().positive() });
const refundSchema = z.object({ amount: z.number().positive(), reason: z.string().min(1) });
const rejectSchema = z.object({ reason: z.string().min(1) });

@ApiTags('admin:bookings')
@RequirePermissions('bookings.view')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly svc: BookingsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.svc.adminList(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.adminGet(id);
  }

  @Post(':id/confirm')
  @RequirePermissions('bookings.manage')
  confirm(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.adminConfirm(id, u.sub);
  }

  @Post(':id/complete')
  @RequirePermissions('bookings.manage')
  complete(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.adminComplete(id, u.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions('bookings.manage')
  cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.adminCancel(id, cancelSchema.parse(body).reason, u.sub);
  }

  @Post(':id/extend-hold')
  @RequirePermissions('bookings.manage')
  extend(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.extendHold(id, extendSchema.parse(body).minutes);
  }
}

@ApiTags('admin:payments')
@RequirePermissions('payments.view')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly svc: BookingsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.svc.adminPaymentsList(query);
  }

  @Post(':id/refund')
  @RequirePermissions('payments.refund')
  refund(@Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const { amount, reason } = refundSchema.parse(body);
    return this.svc.refund(id, amount, reason, u.sub);
  }

  @Post(':id/transfer/approve')
  @RequirePermissions('payments.review')
  approve(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.reviewTransfer(id, true, undefined, u.sub);
  }

  @Post(':id/transfer/reject')
  @RequirePermissions('payments.review')
  reject(@Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.reviewTransfer(id, false, rejectSchema.parse(body).reason, u.sub);
  }
}

@ApiTags('admin:bank-accounts')
@RequirePermissions('settings.payments')
@Controller('admin/bank-accounts')
export class BankAccountsController {
  constructor(private readonly svc: BankAccountsService) {}

  @Get()
  async list() {
    return { items: await this.svc.list() };
  }

  @Post()
  create(@Body() body: unknown) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
