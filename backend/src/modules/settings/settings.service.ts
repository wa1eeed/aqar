import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { createRedis, REDIS } from '../../redis/redis.module';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  defaultsFor,
  isSettingsKey,
  SETTINGS_KEYS,
  SETTINGS_SECTIONS,
  type SettingsKey,
  type SettingsValue,
} from './schemas';

const CACHE_TTL_MS = 30_000;
const INVALIDATE_CHANNEL = 'settings:invalidate';

export const SETTINGS_UPDATED = 'settings.updated';
export const THEME_UPDATED = 'settings.theme_updated';

/**
 * Validated, cached settings sections (docs/07 §10). Values are re-validated on read, so a section
 * saved by an older version gains new fields with their defaults.
 */
@Injectable()
export class SettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<SettingsKey, { value: unknown; at: number }>();
  private subscriber: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    // Other API/worker instances drop their cached copy when a section changes.
    this.subscriber = createRedis(this.env.REDIS_URL, 'nx-settings-sub');
    await this.subscriber.subscribe(INVALIDATE_CHANNEL);
    this.subscriber.on('message', (_channel, key: string) => {
      if (isSettingsKey(key)) this.cache.delete(key);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as SettingsValue<K>;

    const row = await this.prisma.settingsSection.findUnique({ where: { key } });
    let value: SettingsValue<K>;
    if (!row) {
      value = defaultsFor(key);
    } else {
      const parsed = SETTINGS_SECTIONS[key].schema.safeParse(row.value);
      if (parsed.success) {
        value = parsed.data as SettingsValue<K>;
      } else {
        this.logger.error(
          { key, issues: parsed.error.issues.length },
          'stored settings section is invalid; using defaults',
        );
        value = defaultsFor(key);
      }
    }
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  async getAll(): Promise<{ [K in SettingsKey]: SettingsValue<K> }> {
    const entries = await Promise.all(SETTINGS_KEYS.map(async (k) => [k, await this.get(k)] as const));
    return Object.fromEntries(entries) as { [K in SettingsKey]: SettingsValue<K> };
  }

  /**
   * Replace a section. Input is validated strictly (unknown keys rejected, HTML sanitised), the
   * change is audited in the same transaction, then caches are invalidated and events emitted.
   */
  async update<K extends SettingsKey>(key: K, input: unknown, actorId: string | null): Promise<SettingsValue<K>> {
    if (!isSettingsKey(key)) throw new AppException('NOT_FOUND', 404, 'القسم غير موجود');
    const value = SETTINGS_SECTIONS[key].schema.parse(input) as SettingsValue<K>;
    const before = await this.get(key);

    await this.prisma.$transaction(async (tx) => {
      await tx.settingsSection.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
        update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
      });
      await this.audit.record(
        {
          action: 'settings.update',
          entityType: 'settings',
          entityId: key,
          before,
          after: value,
          ...(actorId ? { actor: { type: 'staff' as const, id: actorId } } : {}),
        },
        tx,
      );
    });

    this.cache.delete(key);
    await this.redis
      .publish(INVALIDATE_CHANNEL, key)
      .catch((err) => this.logger.warn({ err }, 'invalidate publish failed'));
    this.events.emit(SETTINGS_UPDATED, { key });
    if (key === 'branding') this.events.emit(THEME_UPDATED, { key });
    return value;
  }

  /** Insert defaults for sections that do not exist yet (never overwrites). Used by the seed. */
  async ensureDefaults(): Promise<SettingsKey[]> {
    const existing = new Set((await this.prisma.settingsSection.findMany({ select: { key: true } })).map((r) => r.key));
    const created: SettingsKey[] = [];
    for (const key of SETTINGS_KEYS) {
      if (existing.has(key)) continue;
      await this.prisma.settingsSection.create({ data: { key, value: defaultsFor(key) as Prisma.InputJsonValue } });
      created.push(key);
    }
    return created;
  }
}
