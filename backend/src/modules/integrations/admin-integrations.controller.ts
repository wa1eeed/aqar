import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { REAUTH_WINDOW_SEC, type AuthUser } from '../auth/auth.types';
import { formFor } from './form';
import { IntegrationsGateway } from './gateway.service';
import { IntegrationStore } from './integration-store.service';

const KEY = /^[a-z]+\.[a-z0-9]+$/;

class UpdateIntegrationDto extends createZodDto(
  z
    .object({
      config: z.record(z.string().max(60), z.unknown()).optional(),
      secrets: z.record(z.string().max(60), z.union([z.string().max(10_000), z.null()])).optional(),
      environment: z.enum(['sandbox', 'live']).optional(),
      /** Moving to «مباشر» must be confirmed explicitly (docs/05 §5). */
      confirmLive: z.boolean().optional(),
    })
    .strict(),
) {}

class LogsQuery extends createZodDto(
  z
    .object({
      success: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(50),
    })
    .strict(),
) {}

/** docs/02 §6 Integrations [integrations.manage]; secrets are write-only and need re-auth. */
@ApiTags('admin/integrations')
@Controller('admin/integrations')
export class AdminIntegrationsController {
  constructor(
    private readonly store: IntegrationStore,
    private readonly gateway: IntegrationsGateway,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private key(k: string): string {
    if (!KEY.test(k)) throw new AppException('NOT_FOUND', 404, 'التكامل غير موجود');
    this.store.def(k);
    return k;
  }

  /** All integrations grouped by category with status, health and environment (no secrets). */
  @Staff('integrations.manage')
  @Get()
  async list() {
    return { items: await this.store.list() };
  }

  /** One integration: config, masked secret hints, generated form definition and status. */
  @Staff('integrations.manage')
  @Get(':key')
  async get(@Param('key') k: string) {
    const key = this.key(k);
    const def = this.store.def(key);
    return {
      ...(await this.store.view(key)),
      form: formFor(def),
      webhookUrl: def.webhookPath ? `${this.env.PUBLIC_URL}${def.webhookPath}` : null,
    };
  }

  /** Save config and/or secrets (write-only, encrypted); secrets need a recent re-authentication. */
  @Staff('integrations.manage')
  @Put(':key')
  async update(@CurrentUser() user: AuthUser, @Param('key') k: string, @Body() body: UpdateIntegrationDto) {
    const key = this.key(k);
    const sensitive = body.secrets !== undefined || key === 'storage.r2' || body.environment === 'live';
    if (sensitive && Date.now() / 1000 - user.authTime > REAUTH_WINDOW_SEC) {
      throw new AppException('REAUTH_REQUIRED', 401, 'يلزم تأكيد هويتك مرة أخرى لإتمام هذا الإجراء');
    }
    if (body.environment === 'live' && !body.confirmLive) {
      throw new AppException('CONFIRM_LIVE_REQUIRED', 422, 'التبديل إلى البيئة المباشرة يتطلب تأكيداً');
    }
    await this.store.update(
      key,
      { config: body.config, secrets: body.secrets, environment: body.environment },
      user.id,
    );
    return this.get(key);
  }

  /** Run the provider's connection test through the gateway and record the result. */
  @Staff('integrations.manage')
  @Post(':key/test')
  @HttpCode(200)
  test(@Param('key') k: string) {
    return this.gateway.test(this.key(k));
  }

  /** Enable an integration (refused for prepared integrations or missing credentials). */
  @Staff('integrations.manage')
  @Post(':key/enable')
  @HttpCode(204)
  async enable(@CurrentUser() user: AuthUser, @Param('key') k: string): Promise<void> {
    await this.store.setEnabled(this.key(k), true, user.id);
  }

  /** Disable an integration. */
  @Staff('integrations.manage')
  @Post(':key/disable')
  @HttpCode(204)
  async disable(@CurrentUser() user: AuthUser, @Param('key') k: string): Promise<void> {
    await this.store.setEnabled(this.key(k), false, user.id);
  }

  /** Recent call logs of an integration (redacted, 30-day retention). */
  @Staff('integrations.manage')
  @Get(':key/logs')
  async logs(@Param('key') k: string, @Query() q: LogsQuery) {
    const items = await this.prisma.integrationCallLog.findMany({
      where: { integrationKey: this.key(k), ...(q.success ? { success: q.success === 'true' } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      select: {
        id: true,
        operation: true,
        success: true,
        httpStatus: true,
        latencyMs: true,
        correlationId: true,
        error: true,
        createdAt: true,
        request: true,
        response: true,
      },
    });
    return { items };
  }
}
