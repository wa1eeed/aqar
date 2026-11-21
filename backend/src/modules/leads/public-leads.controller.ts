import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LeadsService, type PublicLeadInput } from './leads.service.js';
import { CurrentUser, Public } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

@ApiTags('public:leads')
@Public()
@Controller('public')
export class PublicLeadsController {
  constructor(private readonly svc: LeadsService) {}

  @Post('leads')
  @HttpCode(201)
  create(@Body() body: PublicLeadInput, @CurrentUser() user?: AuthUser) {
    const customerId = user?.typ === 'customer' ? user.sub : null;
    return this.svc.createPublic(body, customerId);
  }
}
