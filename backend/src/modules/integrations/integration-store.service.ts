import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type Integration, type IntegrationEnv, type IntegrationHealth } from '@prisma/client';
import type Redis from 'ioredis';
import { AppException } from '../../common/errors/app-exception';
import { MASK } from '../../common/security/redact';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedis, REDIS } from '../../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../crypto/encryption.service';
import { provider } from './providers';
import type { ProviderDefinition } from './types';

export interface Resolved {
  def: ProviderDefinition;
  row: Integration;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

const CACHE_TTL_MS = 60_000;
const CHANNEL = 'integrations:invalidate';

/** Masked display value: last 4 characters only (docs/05 §5). */
export function hintFor(value: string): string {
  return value.length > 8 ? `${MASK}${value.slice(-4)}` : MASK;
}

/**
 * Integration rows: non-secret config + AES-256-GCM encrypted secrets bound to the integration key.
 * Decrypted values are cached in memory for 60 s and dropped on every instance via Redis pub/sub
 * when an admin saves, so a new API key takes effect without a restart.
 */
@Injectable()
export class IntegrationStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationStore.name);
  private readonly cache = new Map<string, { value: Resolved; at: number }>();
  private sub: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    this.sub = createRedis(this.env.REDIS_URL, 'nx-integrations-sub');
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_c, key: string) => this.cache.delete(key));
  }

  async onModuleDestroy(): Promise<void> {
    await this.sub?.quit().catch(() => undefined);
  }

  def(key: string): ProviderDefinition {
    const d = provider(key);
    if (!d) throw new AppException('NOT_FOUND', 404, 'التكامل غير موجود');
    return d;
  }

  /** Infrastructure defaults from the environment, used when nothing was saved in the admin. */
  private envDefaults(key: string): { config: Record<string, unknown>; secrets: Record<string, string> } {
    const e = this.env;
    if (key === 'email.resend') return { config: {}, secrets: e.RESEND_API_KEY ? { apiKey: e.RESEND_API_KEY } : {} };
    if (key === 'storage.r2') {
      const config: Record<string, unknown> = {};
      if (e.R2_ACCOUNT_ID) config.accountId = e.R2_ACCOUNT_ID;
      if (e.R2_UPLOADS_BUCKET) config.uploadsBucket = e.R2_UPLOADS_BUCKET;
      if (e.R2_MEDIA_BUCKET) config.mediaBucket = e.R2_MEDIA_BUCKET;
      if (e.R2_PUBLIC_BASE_URL) config.publicBaseUrl = e.R2_PUBLIC_BASE_URL;
      const secrets: Record<string, string> = {};
      if (e.R2_ACCESS_KEY_ID) secrets.accessKeyId = e.R2_ACCESS_KEY_ID;
      if (e.R2_SECRET_ACCESS_KEY) secrets.secretAccessKey = e.R2_SECRET_ACCESS_KEY;
      return { config, secrets };
    }
    return { config: {}, secrets: {} };
  }

  private decryptSecrets(row: Integration): Record<string, string> {
    if (!row.secretsEnc) return {};
    try {
      return this.crypto.decryptJson<Record<string, string>>(row.secretsEnc, `integration:${row.key}`);
    } catch {
      this.logger.error({ key: row.key }, 'integration secrets cannot be decrypted (wrong APP_ENCRYPTION_KEY?)');
      return {};
    }
  }

  async resolve(key: string): Promise<Resolved> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const def = this.def(key);
    const row =
      (await this.prisma.integration.findUnique({ where: { key } })) ??
      (await this.prisma.integration.create({
        data: {
          key,
          category: def.category,
          enabled: def.defaultEnabled ?? false,
          config: def.configSchema.parse({}) as Prisma.InputJsonValue,
        },
      }));
    const env = this.envDefaults(key);
    const saved = (row.config ?? {}) as Record<string, unknown>;
    const parsed = def.configSchema.safeParse({ ...env.config, ...stripEmpty(saved) });
    const config = (parsed.success ? parsed.data : def.configSchema.parse({})) as Record<string, unknown>;
    const secrets = { ...env.secrets, ...this.decryptSecrets(row) };
    const value: Resolved = { def, row, config, secrets };
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  private async invalidate(key: string): Promise<void> {
    this.cache.delete(key);
    await this.redis.publish(CHANNEL, key).catch(() => undefined);
  }

  /** Public view for the admin: config values, secret hints only, never secret values. */
  async view(key: string) {
    const r = await this.resolve(key);
    const savedSecrets = this.decryptSecrets(r.row);
    const secretKeys = Object.keys((r.def.secretsSchema as unknown as { shape?: object }).shape ?? {});
    return {
      key: r.def.key,
      category: r.def.category,
      nameAr: r.def.nameAr,
      descriptionAr: r.def.descriptionAr,
      docsUrl: r.def.docsUrl ?? null,
      prepared: !!r.def.prepared,
      supportsSandbox: r.def.supportsSandbox,
      enabled: r.row.enabled,
      environment: r.row.environment,
      health: r.row.health,
      healthCheckedAt: r.row.healthCheckedAt,
      lastError: r.row.lastError,
      config: r.config,
      secrets: Object.fromEntries(
        secretKeys.map((k) => {
          const fromDb = savedSecrets[k];
          const fromEnv = !fromDb && r.secrets[k];
          return [k, { set: !!(fromDb || fromEnv), hint: fromDb ? hintFor(fromDb) : fromEnv ? `${MASK} (env)` : null }];
        }),
      ),
    };
  }

  /**
   * Saves config and/or secrets. Secrets are write-only: a provided value replaces it, `null` removes
   * it, omitted keys are kept. Everything is validated against the provider schemas and audited
   * (`integration.config.update` / `integration.secrets.update`, values redacted).
   */
  async update(
    key: string,
    input: { config?: Record<string, unknown>; secrets?: Record<string, string | null>; environment?: IntegrationEnv },
    actorId: string,
  ): Promise<void> {
    const def = this.def(key);
    const row = (await this.resolve(key)).row;
    const data: Prisma.IntegrationUpdateInput = {};

    if (input.config) {
      const merged = { ...((row.config ?? {}) as Record<string, unknown>), ...input.config };
      data.config = def.configSchema.parse(merged) as Prisma.InputJsonValue;
    }
    if (input.secrets) {
      const current = this.decryptSecrets(row);
      const next: Record<string, string> = { ...current };
      for (const [k, v] of Object.entries(input.secrets)) {
        if (v === null || v === '') delete next[k];
        else next[k] = v;
      }
      const valid = def.secretsSchema.parse(next) as Record<string, string>;
      data.secretsEnc = Object.keys(valid).length ? this.crypto.encryptJson(valid, `integration:${key}`) : null;
      data.secretsHint = Object.fromEntries(
        Object.entries(valid).map(([k, v]) => [k, hintFor(v)]),
      ) as Prisma.InputJsonValue;
    }
    if (input.environment && input.environment !== row.environment) {
      if (!def.supportsSandbox)
        throw new AppException('VALIDATION_FAILED', 400, 'هذا التكامل لا يدعم البيئة التجريبية');
      data.environment = input.environment;
      data.health = 'unknown';
    }
    if (Object.keys(data).length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.integration.update({ where: { key }, data: { ...data, updatedById: actorId } });
      if (input.config || input.environment) {
        await this.audit.record(
          {
            action: 'integration.config.update',
            entityType: 'integration',
            entityId: key,
            before: { config: row.config, environment: row.environment },
            after: { config: data.config ?? row.config, environment: data.environment ?? row.environment },
          },
          tx,
        );
      }
      if (input.secrets) {
        await this.audit.record(
          {
            action: 'integration.secrets.update',
            entityType: 'integration',
            entityId: key,
            after: { changed: Object.keys(input.secrets) },
          },
          tx,
        );
      }
    });
    await this.invalidate(key);
  }

  async setEnabled(key: string, enabled: boolean, actorId: string): Promise<void> {
    const def = this.def(key);
    if (enabled && def.prepared)
      throw new AppException('PROVIDER_NOT_READY', 422, 'هذا التكامل بانتظار بيانات الربط من الجهة المزوّدة');
    await this.resolve(key);
    await this.prisma.$transaction(async (tx) => {
      await tx.integration.update({ where: { key }, data: { enabled, updatedById: actorId } });
      await this.audit.record(
        { action: enabled ? 'integration.enable' : 'integration.disable', entityType: 'integration', entityId: key },
        tx,
      );
    });
    await this.invalidate(key);
  }

  /** Records health; emits `integration.health_changed` when it changes (docs/05 §1.8). */
  async setHealth(key: string, health: IntegrationHealth, lastError: string | null): Promise<void> {
    const before = await this.prisma.integration.findUnique({ where: { key }, select: { health: true } });
    await this.prisma.integration.update({
      where: { key },
      data: { health, healthCheckedAt: new Date(), lastError: lastError?.slice(0, 500) ?? null },
    });
    await this.invalidate(key);
    if (before && before.health !== health)
      this.events.emit('integration.health_changed', { key, from: before.health, to: health });
  }

  async list() {
    const rows = await this.prisma.integration.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const { PROVIDERS } = await import('./providers');
    return PROVIDERS.map((d) => {
      const r = byKey.get(d.key);
      return {
        key: d.key,
        category: d.category,
        nameAr: d.nameAr,
        descriptionAr: d.descriptionAr,
        prepared: !!d.prepared,
        enabled: r?.enabled ?? d.defaultEnabled ?? false,
        environment: r?.environment ?? 'sandbox',
        health: r?.health ?? 'unknown',
        healthCheckedAt: r?.healthCheckedAt ?? null,
      };
    });
  }
}

function stripEmpty(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}
