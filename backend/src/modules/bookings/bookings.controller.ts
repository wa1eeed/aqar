import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Customer, Staff } from '../../common/auth/decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { plainText } from '../../common/security/zod-helpers';
import type { AuthUser } from '../auth/auth.types';
import { BookingsService } from './bookings.service';

const propertyId = z.number().int().min(1).max(2_147_483_647);
const paymentType = z.enum(['deposit', 'full']);
const paymentMethod = z.enum(['moyasar', 'bank_transfer', 'rize']);

class QuoteDto extends createZodDto(z.object({ propertyId, paymentType: paymentType.optional() }).strict()) {}
class CreateBookingDto extends createZodDto(
  z
    .object({
      propertyId,
      paymentType,
      paymentMethod,
      termsVersion: z.string().min(1).max(20),
      notes: z.union([z.literal(''), plainText(1000)]).nullish(),
    })
    .strict(),
) {}
class PayDto extends createZodDto(z.object({ method: paymentMethod }).strict()) {}
class AdminListQuery extends createZodDto(
  z
    .object({
      status: z
        .enum([
          'pending_payment',
          'awaiting_transfer_review',
          'confirmed',
          'completed',
          'cancelled',
          'expired',
          'refunded',
        ])
        .optional(),
      q: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict(),
) {}
class CancelDto extends createZodDto(z.object({ reason: plainText(300).pipe(z.string().min(2)) }).strict()) {}
class ExtendDto extends createZodDto(z.object({ hours: z.number().int().min(1).max(168) }).strict()) {}

/** The customer's bookings (docs/02 §5, docs/04 §3). */
@ApiTags('me/bookings')
@Controller('me/bookings')
export class MeBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Amounts, payment types and available methods for booking a property (server-computed). */
  @Customer()
  @RateLimit({ name: 'booking-quote', limit: 60, windowSec: 60, by: 'ip' })
  @HttpCode(200)
  @Post('quote')
  quote(@Body() b: QuoteDto) {
    return this.bookings.quote(b.propertyId, b.paymentType);
  }

  /** Create a booking (row lock + one active booking per property → 409) and start its payment; Idempotency-Key supported. */
  @Customer()
  @RateLimit({ name: 'booking-create', limit: 10, windowSec: 3600, by: 'ip' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() b: CreateBookingDto, @Headers('idempotency-key') key?: string) {
    return this.bookings.create(user, b, key);
  }

  /** The customer's bookings with payments, transfer submission and timeline. */
  @Customer()
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.bookings.myList(user);
  }

  /** One of the customer's bookings. */
  @Customer()
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.mine(user, id);
  }

  /** Cancel while the booking is pending payment or awaiting transfer review. */
  @Customer()
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.cancelByCustomer(user, id);
  }

  /** Start another payment attempt (e.g. after a failed card payment) within the same hold. */
  @Customer()
  @RateLimit({ name: 'booking-pay', limit: 20, windowSec: 3600, by: 'ip' })
  @HttpCode(200)
  @Post(':id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: PayDto) {
    return this.bookings.payAgain(user, id, b.method);
  }
}

/** Bookings administration (docs/02 §6, docs/07 §6); agents see bookings on their own listings. */
@ApiTags('admin/bookings')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Bookings with status filter, search and per-status counts. */
  @Staff('bookings.view')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: AdminListQuery) {
    return this.bookings.adminList(user, q);
  }

  /** Booking details: property, customer, payments, transfer submission and audit timeline. */
  @Staff('bookings.view')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.adminGet(user, id);
  }

  /** Confirm manually once the amount due has been received (property becomes reserved). */
  @Staff('bookings.manage')
  @HttpCode(200)
  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.adminConfirm(user, id);
  }

  /** Complete the deal (property becomes sold or rented). */
  @Staff('bookings.manage')
  @HttpCode(200)
  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.adminComplete(user, id);
  }

  /** Cancel with a reason; a reserved property returns to available. Refunds are separate (payments). */
  @Staff('bookings.manage')
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: CancelDto) {
    return this.bookings.adminCancel(user, id, b.reason);
  }

  /** Extend the payment hold by 1–168 hours. */
  @Staff('bookings.manage')
  @HttpCode(200)
  @Post(':id/extend-hold')
  extend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: ExtendDto) {
    return this.bookings.adminExtendHold(user, id, b.hours);
  }
}
