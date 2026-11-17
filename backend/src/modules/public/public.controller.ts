import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/decorators';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PublicLeadDto, PublicLeadsService } from '../leads/public-leads';
import { listQuerySchema } from '../properties/query';
import { PublicService } from './public.service';

class PublicListQuery extends createZodDto(listQuerySchema) {}
class SimilarQuery extends createZodDto(
  z.object({ limit: z.coerce.number().int().min(1).max(12).default(4) }).strip(),
) {}

const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=120';

function id32(id: number): number {
  if (id < 1 || id > 2_147_483_647) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
  return id;
}

/** docs/02 §2 — public endpoints (no auth). GETs are rate limited globally (120/min/IP). */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly pub: PublicService,
    private readonly leads: PublicLeadsService,
  ) {}

  /** Everything the static site needs at boot: brand, theme, contact, licensing, map, features (no secrets). */
  @Get('config')
  async config(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return this.pub.config();
  }

  /** Merged schema: property types/fields from @nx/schema plus active cities and districts. */
  @Get('schema')
  async schema(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return this.pub.schema();
  }

  /** Published properties with the site's filters, sorting and paging (closed listings last). */
  @Get('properties')
  async list(@Query() q: PublicListQuery, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return this.pub.list(q);
  }

  /** One published property (public payload; location may be approximate). */
  @Get('properties/:id')
  async get(@Param('id', ParseIntPipe) id: number, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return this.pub.get(id32(id), req.ip ?? null);
  }

  /** Similar published properties (same type, then offer, then city). */
  @Get('properties/:id/similar')
  async similar(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: SimilarQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return this.pub.similar(id32(id), q.limit);
  }

  /** Counts of published, non-closed properties by type, city and offer. */
  @Get('stats')
  async stats(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return this.pub.stats();
  }

  /** Public card of a listing agent. */
  @Get('agents/:id')
  agent(@Param('id') id: string) {
    if (!/^[a-z0-9]{10,40}$/.test(id)) throw new AppException('NOT_FOUND', 404, 'المستشار غير موجود');
    return this.pub.agent(id);
  }

  /** docs/02 §2.2; 10/hour/IP (docs/02 §1), Idempotency-Key supported. */
  @RateLimit({ name: 'leads', limit: 10, windowSec: 3600, by: 'ip', failClosed: true })
  @Post('leads')
  @HttpCode(201)
  createLead(
    @Body() body: PublicLeadDto,
    @CurrentUser() user: AuthUser | undefined,
    @Headers('idempotency-key') idem?: string,
  ) {
    return this.leads.create(body, user, idem);
  }
}
