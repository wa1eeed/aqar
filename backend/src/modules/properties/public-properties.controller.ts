import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PropertiesService } from './properties.service.js';
import { Public } from '../auth/decorators.js';

@ApiTags('public:properties')
@Public()
@Controller('public')
export class PublicPropertiesController {
  constructor(private readonly svc: PropertiesService) {}

  @Get('properties')
  list(@Query() query: Record<string, unknown>) {
    return this.svc.publicList(query);
  }

  @Get('stats')
  stats() {
    return this.svc.stats();
  }

  @Get('properties/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publicGet(id);
  }

  @Get('properties/:id/similar')
  similar(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.svc.similar(id, limit ? Number(limit) : 4);
  }

  @Get('properties/:id/nearby')
  async nearby(@Param('id', ParseIntPipe) id: number, @Query('radius') radius?: string) {
    const items = await this.svc.nearby(id, radius ? Number(radius) : 2000);
    return { items }; // الواجهة تتوقّع { items }
  }
}
