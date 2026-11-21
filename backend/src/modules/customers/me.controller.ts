import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeService } from './me.service.js';
import { CurrentUser, RequireCustomer } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

@ApiTags('customer:me')
@RequireCustomer()
@Controller('me')
export class MeController {
  constructor(private readonly svc: MeService) {}

  @Get('favorites')
  favorites(@CurrentUser() u: AuthUser) {
    return this.svc.favorites(u.sub);
  }

  @Put('favorites/:propertyId')
  addFavorite(@Param('propertyId', ParseIntPipe) propertyId: number, @CurrentUser() u: AuthUser) {
    return this.svc.addFavorite(u.sub, propertyId);
  }

  @Delete('favorites/:propertyId')
  removeFavorite(@Param('propertyId', ParseIntPipe) propertyId: number, @CurrentUser() u: AuthUser) {
    return this.svc.removeFavorite(u.sub, propertyId);
  }

  @Get('saved-searches')
  savedSearches(@CurrentUser() u: AuthUser) {
    return this.svc.savedSearches(u.sub);
  }

  @Post('saved-searches')
  createSaved(@Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.createSavedSearch(u.sub, body);
  }

  @Patch('saved-searches/:id')
  updateSaved(@Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    return this.svc.updateSavedSearch(u.sub, id, body);
  }

  @Delete('saved-searches/:id')
  deleteSaved(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.deleteSavedSearch(u.sub, id);
  }
}
