import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CustomersService } from './customers.service.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const statusSchema = z.object({ status: z.enum(['active', 'blocked']) });

@ApiTags('admin:customers')
@RequirePermissions('customers.view')
@Controller('admin/customers')
export class CustomersAdminController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.svc.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @RequirePermissions('customers.manage')
  setStatus(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.setStatus(id, statusSchema.parse(body).status, user.sub);
  }
}
