import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Customer, RecentAuth, Staff } from '../../common/auth/decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { SAUDI_MOBILE } from '../../common/security/phone';
import { plainText } from '../../common/security/zod-helpers';
import type { AuthUser } from '../auth/auth.types';
import { SessionService } from '../auth/session.service';
import { CustomersService, MAX_FAVORITES, savedSearchQuery } from './customers.service';

class CustomersQuery extends createZodDto(
  z
    .object({
      q: z.string().trim().max(80).optional(),
      status: z.enum(['active', 'blocked', 'deleted']).optional(),
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict(),
) {}
class StatusDto extends createZodDto(z.object({ status: z.enum(['active', 'blocked']) }).strict()) {}

/** docs/02 §6 Customers [customers.*]; agents see customers linked to their leads/bookings. */
@ApiTags('admin/customers')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** Customers with counts of leads and bookings; agents see customers linked to them. */
  @Staff('customers.view')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: CustomersQuery) {
    return this.customers.list(user, q);
  }

  /** CSV export of the filtered customers (re-authentication required). */
  @Staff('customers.view')
  @RecentAuth()
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() user: AuthUser, @Query() q: CustomersQuery) {
    return this.customers.exportCsv(user, q);
  }

  /** Customer profile with leads, viewings, favorites and saved searches. */
  @Staff('customers.view')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.get(user, id);
  }

  /** Block or unblock a customer (blocking ends all their sessions). */
  @Staff('customers.manage')
  @Patch(':id')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: StatusDto) {
    return this.customers.setStatus(user, id, b.status);
  }

  /** PDPL export on the customer's behalf (re-authentication required). */
  @Staff('customers.manage')
  @RecentAuth()
  @Get(':id/export')
  @Header('Cache-Control', 'no-store')
  async exportOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.customers.get(user, id);
    return this.customers.exportData(id);
  }
}

class ProfileDto extends createZodDto(
  z
    .object({
      name: plainText(80).pipe(z.string().min(2)).optional(),
      phone: z.union([z.literal(''), z.string().trim().max(20).regex(SAUDI_MOBILE, 'invalid_phone')]).nullish(),
      email: z.string().trim().toLowerCase().max(254).email('invalid_email').optional(),
      marketingConsent: z.boolean().optional(),
    })
    .strict(),
) {}
class VerifyEmailDto extends createZodDto(
  z
    .object({
      email: z.string().trim().toLowerCase().max(254).email('invalid_email'),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
) {}
class FavoritesDto extends createZodDto(
  z.object({ ids: z.array(z.number().int().min(1).max(2_147_483_647)).max(MAX_FAVORITES) }).strict(),
) {}
const queryStrings = z
  .record(z.string().max(40), z.string().max(500))
  .refine((q) => Object.keys(q).length <= 30, 'too_many_keys')
  .refine((q) => savedSearchQuery.strict().safeParse(q).success, 'invalid_query');
class SavedSearchDto extends createZodDto(
  z
    .object({
      name: plainText(80).pipe(z.string().min(2)),
      query: queryStrings,
      alertEnabled: z.boolean().default(true),
    })
    .strict(),
) {}
class SavedSearchUpdateDto extends createZodDto(
  z.object({ name: plainText(80).pipe(z.string().min(2)).optional(), alertEnabled: z.boolean().optional() }).strict(),
) {}

/** The customer's own account (docs/02 §5). Every query is bound to the token's subject. */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly customers: CustomersService,
    private readonly sessions: SessionService,
  ) {}

  /** The customer's profile. */
  @Customer()
  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.customers.profile(user);
  }

  /** Update name, phone and marketing consent; a new email is applied only after code verification. */
  @Customer()
  @RateLimit({ name: 'me-profile', limit: 20, windowSec: 3600, by: 'ip' })
  @Patch('profile')
  update(@CurrentUser() user: AuthUser, @Body() b: ProfileDto) {
    return this.customers.updateProfile(user, { ...b, ...(b.phone === '' ? { phone: null } : {}) });
  }

  /** Confirm a new email address with the code sent to it. */
  @Customer()
  @RateLimit({ name: 'me-verify-email', limit: 10, windowSec: 3600, by: 'ip' })
  @HttpCode(200)
  @Post('profile/verify-email')
  verifyEmail(@CurrentUser() user: AuthUser, @Body() b: VerifyEmailDto) {
    return this.customers.verifyEmail(user, b.email, b.code);
  }

  /** PDPL deletion request: signs out everywhere; personal data is anonymised after 30 days. */
  @Customer()
  @HttpCode(200)
  @Delete()
  remove(@CurrentUser() user: AuthUser) {
    return this.customers.requestDeletion(user);
  }

  /** PDPL export of everything stored about the customer (JSON). */
  @Customer()
  @RateLimit({ name: 'me-export', limit: 5, windowSec: 3600, by: 'ip' })
  @Header('Cache-Control', 'no-store')
  @Header('Content-Disposition', 'attachment; filename="my-data.json"')
  @Get('export')
  exportData(@CurrentUser() user: AuthUser) {
    return this.customers.exportData(user.id);
  }

  /** «تسجيل الخروج من جميع الأجهزة». */
  @Customer()
  @HttpCode(204)
  @Post('sessions/revoke-all')
  async revokeAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.sessions.revokeAll('customer', user.id);
  }

  /** Ids of the customer's favorite published properties. */
  @Customer()
  @Get('favorites')
  favorites(@CurrentUser() user: AuthUser) {
    return this.customers.favorites(user);
  }

  /** Merge the browser's local favorites into the account (on login). */
  @Customer()
  @Put('favorites')
  merge(@CurrentUser() user: AuthUser, @Body() b: FavoritesDto) {
    return this.customers.mergeFavorites(user, b.ids);
  }

  /** Add a property to favorites. */
  @Customer()
  @Put('favorites/:propertyId')
  add(@CurrentUser() user: AuthUser, @Param('propertyId', ParseIntPipe) id: number) {
    return this.customers.addFavorite(user, id);
  }

  /** Remove a property from favorites. */
  @Customer()
  @Delete('favorites/:propertyId')
  removeFavorite(@CurrentUser() user: AuthUser, @Param('propertyId', ParseIntPipe) id: number) {
    return this.customers.removeFavorite(user, id);
  }

  /** The customer's saved searches. */
  @Customer()
  @Get('saved-searches')
  saved(@CurrentUser() user: AuthUser) {
    return this.customers.savedSearches(user);
  }

  /** Save a search (public list query) with a daily alert. */
  @Customer()
  @Post('saved-searches')
  createSaved(@CurrentUser() user: AuthUser, @Body() b: SavedSearchDto) {
    return this.customers.createSavedSearch(user, b);
  }

  /** Rename a saved search or toggle its alert. */
  @Customer()
  @Patch('saved-searches/:id')
  updateSaved(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: SavedSearchUpdateDto) {
    return this.customers.updateSavedSearch(user, id, b);
  }

  /** Delete a saved search. */
  @Customer()
  @HttpCode(204)
  @Delete('saved-searches/:id')
  async deleteSaved(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.customers.deleteSavedSearch(user, id);
  }

  /** The customer's viewings and requests. */
  @Customer()
  @Get('viewings')
  viewings(@CurrentUser() user: AuthUser) {
    return this.customers.myViewings(user);
  }

  /** Cancel one of the customer's upcoming viewings. */
  @Customer()
  @HttpCode(200)
  @Post('viewings/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.cancelViewing(user, id);
  }
}
