import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { LocationsService } from './locations.service.js';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('admin:locations')
@RequirePermissions('settings.locations')
@Controller('admin/locations')
export class LocationsController {
  constructor(private readonly svc: LocationsService) {}

  @Get('cities')
  cities() {
    return this.svc.listCities();
  }

  @Post('districts')
  createDistrict(@Body() body: unknown) {
    return this.svc.createDistrict(body);
  }

  @Patch('districts/:id')
  updateDistrict(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateDistrict(id, body);
  }

  @Patch('districts/:id/active')
  setActive(@Param('id') id: string, @Body() body: unknown) {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(body);
    return this.svc.setDistrictActive(id, isActive);
  }
}
