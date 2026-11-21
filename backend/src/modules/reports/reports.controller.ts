import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequirePermissions, RequireStaff } from '../auth/decorators.js';
import { toCsv } from './csv.js';

@ApiTags('admin:reports')
@RequirePermissions('reports.view')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get(':kind')
  async report(
    @Param('kind') kind: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.svc.run(kind, from, to);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${kind}.csv"`);
      return toCsv(r.rows);
    }
    return r;
  }
}

@ApiTags('admin:audit')
@RequirePermissions('audit.view')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('actorId') actorId?: string) {
    return this.audit.list({ entityType, entityId, actorId });
  }
}

@ApiTags('admin:system')
@RequireStaff()
@Controller('admin/system')
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status() {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    const integrations = await this.prisma.scoped.integration.findMany({ select: { key: true, enabled: true, health: true } });
    return { status: db === 'up' ? 'ok' : 'degraded', db, timestamp: new Date().toISOString(), integrations };
  }
}
