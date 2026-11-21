import { ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { getProvider, providersByScope } from './registry.js';
import type { ProviderDefinition, ProviderScope } from './provider-definition.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { redactIntegration, redactAndTruncate } from './redaction.js';
import type { NearbyItem, EmailMessage, MapsPublicConfig, StorageBucket } from './capabilities.js';
import { overpassNearby, type OverpassConfig } from './providers/overpass.provider.js';
import { sendResendEmail, type ResendConfig, type ResendSecrets } from './providers/resend.provider.js';
import { r2Storage, type R2Config, type R2Secrets } from './providers/r2.provider.js';
import { osmPublicConfig, type OsmConfig } from './providers/osm.provider.js';

interface ResolvedCtx {
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
  environment: 'sandbox' | 'live';
}

interface Actor {
  id?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly cache = new Map<string, { ctx: ResolvedCtx; exp: number }>();
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly tenant: TenantContext,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────── القيم الافتراضية من البيئة (للتكاملات المنصّية) ─────────────────
  private envDefaults(key: string): { config: Record<string, unknown>; secrets: Record<string, unknown> } {
    if (key === 'email.resend') {
      return {
        config: { fromName: 'منزلة', fromEmail: this.config.get('RESEND_FROM') ?? '' },
        secrets: { apiKey: this.config.get('RESEND_API_KEY') ?? '' },
      };
    }
    if (key === 'storage.r2') {
      return {
        config: {
          accountId: this.config.get('R2_ACCOUNT_ID') ?? '',
          uploadsBucket: this.config.get('R2_BUCKET_UPLOADS') ?? 'uploads',
          mediaBucket: this.config.get('R2_BUCKET_MEDIA') ?? 'media',
          publicBaseUrl: this.config.get('R2_PUBLIC_BASE') ?? '',
        },
        secrets: {
          accessKeyId: this.config.get('R2_ACCESS_KEY_ID') ?? '',
          secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY') ?? '',
        },
      };
    }
    return { config: {}, secrets: {} };
  }

  private cacheKey(key: string, scope: ProviderScope, tenantId: string | null): string {
    return scope === 'platform' ? `p:${key}` : `t:${tenantId}:${key}`;
  }

  private breaker(key: string): CircuitBreaker {
    let b = this.breakers.get(key);
    if (!b) {
      b = new CircuitBreaker();
      this.breakers.set(key, b);
    }
    return b;
  }

  private requireProvider(key: string): ProviderDefinition {
    const p = getProvider(key);
    if (!p) throw new NotFoundException(`تكامل غير معروف: ${key}`);
    return p;
  }

  /** يمنع إدارة تكامل من خارج نطاقه (مشترك لا يُدير تكاملات المنصّة والعكس). */
  assertScope(key: string, scope: ProviderScope): void {
    if (this.requireProvider(key).scope !== scope) {
      throw new ForbiddenException('هذا التكامل خارج نطاق هذه اللوحة');
    }
  }

  /** يحلّ إعدادات تكامل (مع fallback من البيئة) مع تخزين مؤقّت 60ث؛ يُبطل عند الحفظ. */
  async resolve(key: string): Promise<ResolvedCtx> {
    const provider = this.requireProvider(key);
    const tenantId = provider.scope === 'tenant' ? this.tenant.requireTenantId() : null;
    const ck = this.cacheKey(key, provider.scope, tenantId);
    const cached = this.cache.get(ck);
    if (cached && cached.exp > Date.now()) return cached.ctx;

    let rowConfig: Record<string, unknown> = {};
    let secretsEnc: Uint8Array | null = null;
    let environment: 'sandbox' | 'live' = 'live';

    if (provider.scope === 'platform') {
      const row = await this.prisma.platformIntegration.findUnique({ where: { key } });
      if (row) {
        rowConfig = (row.config as Record<string, unknown>) ?? {};
        secretsEnc = row.secretsEnc;
      }
    } else {
      const row = await this.prisma.integration.findUnique({ where: { tenantId_key: { tenantId: tenantId!, key } } });
      if (row) {
        rowConfig = (row.config as Record<string, unknown>) ?? {};
        secretsEnc = row.secretsEnc;
        environment = row.environment;
      }
    }

    const envd = this.envDefaults(key);
    const config = { ...envd.config, ...rowConfig };
    const secrets = secretsEnc
      ? this.encryption.decryptJson<Record<string, unknown>>(Buffer.from(secretsEnc))
      : envd.secrets;

    const cfg = provider.configSchema.safeParse(config);
    const ctx: ResolvedCtx = {
      config: cfg.success ? (cfg.data as Record<string, unknown>) : config,
      secrets,
      environment,
    };
    this.cache.set(ck, { ctx, exp: Date.now() + CACHE_TTL_MS });
    return ctx;
  }

  private invalidate(key: string): void {
    const provider = getProvider(key);
    if (!provider) return;
    if (provider.scope === 'platform') this.cache.delete(this.cacheKey(key, 'platform', null));
    else this.cache.delete(this.cacheKey(key, 'tenant', this.tenant.tenantId));
  }

  // ───────────────── غلاف الاستدعاء (breaker + سجل + حجب) ─────────────────
  private async execute<T>(key: string, operation: string, fn: (ctx: ResolvedCtx) => Promise<T>): Promise<T> {
    const breaker = this.breaker(key);
    if (breaker.isOpen()) {
      await this.log(key, operation, false, 0, undefined, 'circuit_open');
      throw new ServiceUnavailableException(`خدمة ${key} متوقّفة مؤقتاً`);
    }
    const ctx = await this.resolve(key);
    const start = Date.now();
    try {
      const result = await fn(ctx);
      breaker.recordSuccess();
      await this.log(key, operation, true, Date.now() - start, result);
      return result;
    } catch (err) {
      breaker.recordFailure();
      await this.log(key, operation, false, Date.now() - start, undefined, String(err));
      throw err;
    }
  }

  private async log(
    key: string,
    operation: string,
    success: boolean,
    latencyMs: number,
    response?: unknown,
    error?: string,
  ): Promise<void> {
    try {
      await this.prisma.integrationCallLog.create({
        data: {
          tenantId: this.tenant.tenantId,
          integrationKey: key,
          operation,
          success,
          latencyMs,
          correlationId: 'gateway',
          response: response === undefined ? undefined : (redactAndTruncate(response) as object),
          error: error ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`تعذّر تسجيل استدعاء ${key}: ${String(e)}`);
    }
  }

  /** تنفيذ استدعاء مزوّد عبر البوابة (حلّ + قاطع دائرة + سجل) — للمدفوعات ونحوها. */
  async call<T>(
    key: string,
    operation: string,
    fn: (ctx: { config: Record<string, unknown>; secrets: Record<string, unknown>; environment: 'sandbox' | 'live' }) => Promise<T>,
  ): Promise<T> {
    return this.execute(key, operation, fn);
  }

  // ───────────────── القدرات (Capabilities) ─────────────────
  async mapsPublicConfig(): Promise<MapsPublicConfig> {
    const ctx = await this.resolve('maps.osm');
    return osmPublicConfig(ctx.config as OsmConfig);
  }

  async nearby(lat: number, lng: number, radius: number, cats: string[]): Promise<NearbyItem[]> {
    return this.execute('places.overpass', 'nearby', (ctx) =>
      overpassNearby(ctx.config as OverpassConfig, lat, lng, radius, cats),
    );
  }

  async sendEmail(msg: EmailMessage): Promise<{ id: string }> {
    return this.execute('email.resend', 'send', (ctx) =>
      sendResendEmail({ config: ctx.config as ResendConfig, secrets: ctx.secrets as ResendSecrets, environment: ctx.environment }, msg),
    );
  }

  async isEmailReady(): Promise<boolean> {
    const ctx = await this.resolve('email.resend');
    return typeof (ctx.secrets as ResendSecrets).apiKey === 'string' && (ctx.secrets as ResendSecrets).apiKey.length > 0;
  }

  async presignPut(bucket: StorageBucket, key: string, contentType: string, maxBytes: number) {
    return this.execute('storage.r2', 'presignPut', (ctx) =>
      r2Storage.presignPut(this.r2ctx(ctx), bucket, key, contentType, maxBytes),
    );
  }

  async signedGet(bucket: StorageBucket, key: string, ttlSec: number) {
    return this.execute('storage.r2', 'signedGet', (ctx) => r2Storage.signedGet(this.r2ctx(ctx), bucket, key, ttlSec));
  }

  async deleteObject(bucket: StorageBucket, key: string) {
    return this.execute('storage.r2', 'delete', (ctx) => r2Storage.delete(this.r2ctx(ctx), bucket, key));
  }

  async publicUrl(key: string): Promise<string> {
    const ctx = await this.resolve('storage.r2');
    return r2Storage.publicUrl(this.r2ctx(ctx), key);
  }

  private r2ctx(ctx: ResolvedCtx) {
    return { config: ctx.config as R2Config, secrets: ctx.secrets as R2Secrets, environment: ctx.environment };
  }

  // ───────────────── الإدارة ─────────────────
  describeProviders(scope: ProviderScope) {
    return providersByScope(scope).map((p) => ({
      key: p.key,
      category: p.category,
      nameAr: p.nameAr,
      descriptionAr: p.descriptionAr,
      docsUrl: p.docsUrl,
      prepared: p.prepared ?? false,
      supportsSandbox: p.supportsSandbox,
      webhookPath: p.webhookPath,
      uiHints: p.uiHints,
    }));
  }

  async getIntegration(key: string) {
    const provider = this.requireProvider(key);
    if (provider.scope === 'platform') {
      const row = await this.prisma.platformIntegration.findUnique({ where: { key } });
      return {
        key, scope: provider.scope, enabled: row?.enabled ?? false, environment: 'live',
        config: redactIntegration(row?.config ?? {}), secretsHint: row?.secretsHint ?? {},
        health: row?.health ?? 'unknown', healthCheckedAt: row?.healthCheckedAt ?? null, lastError: row?.lastError ?? null,
      };
    }
    const tenantId = this.tenant.requireTenantId();
    const row = await this.prisma.integration.findUnique({ where: { tenantId_key: { tenantId, key } } });
    return {
      key, scope: provider.scope, enabled: row?.enabled ?? false, environment: row?.environment ?? 'sandbox',
      config: redactIntegration(row?.config ?? {}), secretsHint: row?.secretsHint ?? {},
      health: row?.health ?? 'unknown', healthCheckedAt: row?.healthCheckedAt ?? null, lastError: row?.lastError ?? null,
    };
  }

  async saveConfig(key: string, configInput: unknown, actor: Actor) {
    const provider = this.requireProvider(key);
    const value = (configInput ?? {}) as Record<string, unknown>;
    await this.writeRow(key, provider.scope, { config: value });
    this.invalidate(key);
    await this.audit.record({
      actorType: this.tenant.isPlatform ? 'platform' : 'staff', actorId: actor.id ?? null,
      action: 'integration.config.update', entityType: 'Integration', entityId: key,
      after: value, ip: actor.ip, userAgent: actor.userAgent,
    });
    return this.getIntegration(key);
  }

  async saveSecrets(key: string, secretsInput: unknown, actor: Actor) {
    const provider = this.requireProvider(key);
    const parsed = provider.secretsSchema.safeParse(secretsInput ?? {});
    if (!parsed.success) {
      throw new ServiceUnavailableException('بيانات الأسرار غير صالحة');
    }
    const secrets = parsed.data as Record<string, unknown>;
    const secretsEnc = this.encryption.encryptJson(secrets);
    const secretsHint: Record<string, string> = {};
    for (const [k, v] of Object.entries(secrets)) {
      if (typeof v === 'string' && v.length > 0) secretsHint[k] = this.encryption.mask(v);
    }
    await this.writeRow(key, provider.scope, { secretsEnc, secretsHint });
    this.invalidate(key);
    await this.audit.record({
      actorType: this.tenant.isPlatform ? 'platform' : 'staff', actorId: actor.id ?? null,
      action: 'integration.secrets.update', entityType: 'Integration', entityId: key,
      after: { updated: Object.keys(secrets) }, ip: actor.ip, userAgent: actor.userAgent,
    });
    return this.getIntegration(key);
  }

  async setEnabled(key: string, enabled: boolean, actor: Actor) {
    const provider = this.requireProvider(key);
    await this.writeRow(key, provider.scope, { enabled });
    this.invalidate(key);
    await this.audit.record({
      actorType: this.tenant.isPlatform ? 'platform' : 'staff', actorId: actor.id ?? null,
      action: enabled ? 'integration.enable' : 'integration.disable', entityType: 'Integration', entityId: key,
      ip: actor.ip, userAgent: actor.userAgent,
    });
    return this.getIntegration(key);
  }

  async testConnection(key: string) {
    const provider = this.requireProvider(key);
    const ctx = await this.resolve(key);
    const result = await provider.testConnection(ctx);
    await this.writeRow(key, provider.scope, {
      health: result.ok ? 'ok' : 'down',
      healthCheckedAt: new Date(),
      lastError: result.ok ? null : result.messageAr,
    });
    this.invalidate(key);
    return result;
  }

  async callLogs(key: string, limit = 50) {
    return this.prisma.integrationCallLog.findMany({
      where: { integrationKey: key, tenantId: this.tenant.tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  private async writeRow(key: string, scope: ProviderScope, data: Record<string, unknown>) {
    if (scope === 'platform') {
      await this.prisma.platformIntegration.upsert({
        where: { key },
        create: { key, category: getProvider(key)!.category, ...data },
        update: data,
      });
    } else {
      const tenantId = this.tenant.requireTenantId();
      await this.prisma.integration.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, category: getProvider(key)!.category, ...data },
        update: data,
      });
    }
  }
}
