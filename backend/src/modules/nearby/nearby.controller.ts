import { Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { NearbyService } from './nearby.service';

class NearbyQuery extends createZodDto(
  z.object({ radius: z.coerce.number().int().min(100).max(5000).optional() }).strict(),
) {}

/** docs/02 §2: GET /public/properties/:id/nearby — served through the gateway, cached. */
@ApiTags('public')
@Controller('public/properties')
export class NearbyController {
  constructor(private readonly nearby: NearbyService) {}

  /** Nearby places around a property through the places provider, cached. */
  @Public()
  @Get(':id/nearby')
  async get(@Param('id', ParseIntPipe) id: number, @Query() q: NearbyQuery, @Res({ passthrough: true }) res: Response) {
    if (id < 1 || id > 2_147_483_647) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    const r = await this.nearby.forProperty(id, q.radius);
    return { source: r.source, items: r.items };
  }
}
