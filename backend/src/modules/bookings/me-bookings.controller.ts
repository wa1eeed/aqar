import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BookingsService, createBookingSchema } from './bookings.service.js';
import { CurrentUser, RequireCustomer } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const quoteSchema = z.object({ propertyId: z.number().int(), paymentType: z.enum(['deposit', 'full']) });
const presignSchema = z.object({ contentType: z.string().min(3) });
const transferSchema = z.object({
  bankAccountId: z.string().min(1),
  senderName: z.string().min(2),
  senderBank: z.string().min(2),
  transferReference: z.string().optional(),
  transferredAt: z.string(),
  amount: z.number().positive(),
  receiptKey: z.string().min(1),
});

@ApiTags('customer:bookings')
@RequireCustomer()
@Controller('me')
export class MeBookingsController {
  constructor(private readonly svc: BookingsService) {}

  @Post('bookings/quote')
  quote(@Body() body: unknown) {
    const { propertyId, paymentType } = quoteSchema.parse(body);
    return this.svc.quote(propertyId, paymentType);
  }

  @Post('bookings')
  create(@Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.create(u.sub, createBookingSchema.parse(body));
  }

  @Get('bookings')
  list(@CurrentUser() u: AuthUser) {
    return this.svc.meList(u.sub);
  }

  @Get('bookings/:id')
  get(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.meGet(u.sub, id);
  }

  @Post('bookings/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.meCancel(id, u.sub);
  }

  @Post('payments/:id/transfer/presign')
  presign(@Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.presignTransfer(id, u.sub, presignSchema.parse(body).contentType);
  }

  @Post('payments/:id/transfer')
  transfer(@Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.submitTransfer(id, u.sub, transferSchema.parse(body));
  }

  @Post('payments/:id/verify')
  verify(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.meVerify(id, u.sub);
  }
}
