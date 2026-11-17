import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NearbyKey } from '@nx/schema';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { requestContext } from '../../common/context/request-context';
import { redactForLog, SENSITIVE_KEY } from '../../common/security/redact';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { SettingsService } from '../settings/settings.service';
import { IntegrationStore, type Resolved } from './integration-store.service';
import { googleNearby } from './providers/google';
import { overpassNearby } from './providers/overpass';
import type { NearbyItem } from './providers/places';
import { r2Delete, r2Get, r2PresignPut, r2PublicUrl, r2Put, r2SignedGet, type BucketName } from './providers/r2';
import { resendSend, type OutgoingMessage } from './providers/resend';
import {
  IntegrationError,
  PREPARED_MESSAGE,
  type HttpExchange,
  type HttpResponse,
  type ProviderCtx,
  type TestResult,
} from './types';

export interface RunOptions {
  /** Retries only for idempotent operations (GET / provider-idempotent POST with a key). */
  idempotent?: boolean;
  timeoutMs?: number;
  retries?: number;
  /** Connection tests run even while the integration is disabled. */
  requireEnabled?: boolean;
}

const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 60_000;
const DEFAULT_RATE_PER_MIN = 600;
const MAX_LOG_TEXT = 8 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Removes secrets from URLs before they are logged (?key=…, ?token=…). */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (SENSITIVE_KEY.test(k)) u.searchParams.set(k, '••••');
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return '[invalid-url]';
  }
}

/**
 * SSRF guard for provider calls: https only, no credentials in the URL, and never localhost or a
 * private/link-local/metadata IP literal (some endpoints are editable by admins).
 */
export function assertPublicHttpsUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'invalid provider url');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const privateV4 =
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
  const blocked =
    u.protocol !== 'https:' ||
    u.username !== '' ||
    u.password !== '' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    !host.includes('.') ||
    privateV4.test(host) ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80');
  if (blocked) throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'provider url must be a public https address');
}

function isRetryable(e: unknown): boolean {
  if (e instanceof IntegrationError) return e.retryable;
  const name = (e as { name?: string })?.name;
  // Network failures (fetch TypeError), timeouts (AbortError) and AWS SDK transient errors.
  return (
    name === 'TypeError' ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    (e as { $retryable?: unknown })?.$retryable !== undefined
  );
}

function toIntegrationError(e: unknown, timedOut: boolean): IntegrationError {
  if (e instanceof IntegrationError) return e;
  if (timedOut) return new IntegrationError('INTEGRATION_TIMEOUT', 'provider timeout', undefined, true);
  const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return new IntegrationError(
    'INTEGRATION_HTTP_ERROR',
    (e as Error)?.message?.slice(0, 200) ?? 'provider error',
    status,
    isRetryable(e),
  );
}

/**
 * IntegrationsGateway (docs/05 §1): the only path to third parties. Business code asks for a
 * capability (maps, places, email, storage…), never for a vendor.
 */
@Injectable()
export class IntegrationsGateway {
  private readonly logger = new Logger('IntegrationsGateway');

  constructor(
    private readonly store: IntegrationStore,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ───────────────────────────── execution ─────────────────────────────

  async run<T>(
    key: string,
    operation: string,
    fn: (ctx: ProviderCtx<never, never>, r: Resolved) => Promise<T>,
    opts: RunOptions = {},
  ): Promise<T> {
    const r = await this.store.resolve(key);
    if (opts.requireEnabled !== false && !r.row.enabled)
      throw new IntegrationError('INTEGRATION_DISABLED', `${key} disabled`);

    const breakerKey = `int:breaker:${key}`;
    const openUntil = Number((await this.redis.hget(breakerKey, 'openUntil')) ?? 0);
    if (openUntil > Date.now()) throw new IntegrationError('INTEGRATION_CIRCUIT_OPEN', `${key} circuit open`);

    const limit = Number(r.config.rateLimitPerMin ?? r.def.rateLimitPerMin ?? DEFAULT_RATE_PER_MIN);
    const bucket = `int:rate:${key}:${Math.floor(Date.now() / 60_000)}`;
    const used = await this.redis.incr(bucket);
    if (used === 1) await this.redis.expire(bucket, 70);
    if (used > limit) throw new IntegrationError('INTEGRATION_RATE_LIMITED', `${key} rate limited`);

    const attempts = opts.idempotent ? (opts.retries ?? 2) + 1 : 1;
    const correlationId = requestContext.correlationId();
    let lastError: IntegrationError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const exchanges: HttpExchange[] = [];
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, opts.timeoutMs ?? 8000);
      const started = Date.now();
      try {
        const ctx = this.context(r, correlationId, controller.signal, exchanges);
        const result = await fn(ctx as ProviderCtx<never, never>, r);
        clearTimeout(timer);
        await this.redis.hset(breakerKey, 'fails', 0);
        await this.log(key, operation, true, Date.now() - started, correlationId, exchanges, null);
        return result;
      } catch (e) {
        clearTimeout(timer);
        lastError = toIntegrationError(e, timedOut);
        await this.log(key, operation, false, Date.now() - started, correlationId, exchanges, lastError);
        if (attempt < attempts && lastError.retryable) {
          await sleep(Math.min(4000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 200));
          continue;
        }
        break;
      }
    }

    const fails = await this.redis.hincrby(breakerKey, 'fails', 1);
    await this.redis.expire(breakerKey, 3600);
    if (fails >= BREAKER_THRESHOLD) {
      await this.redis.hset(breakerKey, 'openUntil', Date.now() + BREAKER_OPEN_MS, 'fails', 0);
      await this.store.setHealth(key, 'down', lastError?.message ?? 'circuit open');
    }
    throw lastError ?? new IntegrationError('INTEGRATION_HTTP_ERROR', 'unknown');
  }

  private context(
    r: Resolved,
    correlationId: string,
    signal: AbortSignal,
    exchanges: HttpExchange[],
  ): ProviderCtx<unknown, unknown> {
    return {
      key: r.def.key,
      config: r.config,
      secrets: r.secrets,
      environment: r.row.environment,
      correlationId,
      signal,
      http: async (url, init = {}) => {
        assertPublicHttpsUrl(url);
        const { json, form, ...rest } = init;
        const headers = new Headers(rest.headers);
        headers.set('X-Correlation-Id', correlationId);
        headers.set('User-Agent', 'NX-RealEstate/1.0');
        let body = rest.body;
        if (json !== undefined) {
          headers.set('Content-Type', 'application/json');
          body = JSON.stringify(json);
        } else if (form) {
          headers.set('Content-Type', 'application/x-www-form-urlencoded');
          body = new URLSearchParams(form).toString();
        }
        const exchange: HttpExchange = {
          method: rest.method ?? 'GET',
          url: safeUrl(url),
          requestBody: json ?? (form ? { form: Object.keys(form) } : undefined),
        };
        exchanges.push(exchange);
        const res = await fetch(url, { ...rest, headers, body, signal, redirect: 'error' });
        exchange.status = res.status;
        const text = await res.text();
        let parsed: unknown = text.slice(0, MAX_LOG_TEXT);
        try {
          parsed = JSON.parse(text);
        } catch {
          /* keep text */
        }
        exchange.responseBody = parsed;
        const wrapped: HttpResponse = {
          status: res.status,
          ok: res.ok,
          headers: res.headers,
          text: async () => text,
          json: async <T>() => {
            try {
              return JSON.parse(text) as T;
            } catch {
              throw new IntegrationError('INTEGRATION_BAD_RESPONSE', 'invalid JSON from provider');
            }
          },
        };
        return wrapped;
      },
    };
  }

  /** IntegrationCallLog row + Pino line, both redacted (docs/05 §6). */
  private async log(
    key: string,
    operation: string,
    success: boolean,
    latencyMs: number,
    correlationId: string,
    exchanges: HttpExchange[],
    error: IntegrationError | null,
  ): Promise<void> {
    const last = exchanges[exchanges.length - 1];
    const request = exchanges.length
      ? redactForLog(exchanges.map((x) => ({ method: x.method, url: x.url, body: x.requestBody })))
      : null;
    const response = last ? redactForLog(last.responseBody) : null;
    try {
      await this.prisma.integrationCallLog.create({
        data: {
          integrationKey: key,
          operation,
          success,
          httpStatus: last?.status ?? error?.httpStatus ?? null,
          latencyMs,
          correlationId,
          request: (request ?? Prisma.DbNull) as Prisma.InputJsonValue,
          response: (response ?? Prisma.DbNull) as Prisma.InputJsonValue,
          error: error ? `${error.code}: ${error.message}`.slice(0, 500) : null,
        },
      });
    } catch (e) {
      this.logger.warn({ err: e, key }, 'call log write failed');
    }
    const line = { integration: key, operation, success, latencyMs, httpStatus: last?.status, correlationId };
    if (success) this.logger.debug(line, 'integration call');
    else this.logger.warn({ ...line, error: error?.code }, 'integration call failed');
  }

  // ───────────────────────────── connection tests & health ─────────────────────────────

  async test(key: string): Promise<TestResult & { latencyMs: number }> {
    const started = Date.now();
    const def = this.store.def(key);
    if (def.prepared) return { ok: false, messageAr: PREPARED_MESSAGE, latencyMs: 0 };
    let result: TestResult;
    try {
      result = await this.run(key, 'testConnection', (ctx, r) => r.def.testConnection(ctx as never), {
        requireEnabled: false,
        idempotent: true,
        retries: 0,
      });
    } catch (e) {
      const err = e instanceof IntegrationError ? e : toIntegrationError(e, false);
      const messages: Record<string, string> = {
        INTEGRATION_NOT_CONFIGURED: 'أكمل الإعدادات والمفاتيح أولاً',
        INTEGRATION_CIRCUIT_OPEN: 'أُوقفت الاتصالات مؤقتاً بعد أخطاء متتالية، أعد المحاولة بعد دقيقة',
        INTEGRATION_RATE_LIMITED: 'تجاوزت حد الطلبات لهذا التكامل',
        INTEGRATION_TIMEOUT: 'انتهت مهلة الاتصال بالخدمة',
      };
      result = { ok: false, messageAr: messages[err.code] ?? 'تعذّر الاتصال بالخدمة' };
    }
    await this.store.setHealth(key, result.ok ? 'ok' : 'down', result.ok ? null : result.messageAr);
    return { ...result, latencyMs: Date.now() - started };
  }

  /** Health job (every 15 min, docs/05 §1.8): enabled, implemented integrations only. */
  async checkAllHealth(): Promise<void> {
    const rows = await this.prisma.integration.findMany({ where: { enabled: true } });
    for (const row of rows) {
      const def = this.store.def(row.key);
      if (def.prepared) continue;
      await this.test(row.key).catch((err) => this.logger.warn({ err, key: row.key }, 'health check failed'));
    }
  }

  // ───────────────────────────── capabilities (docs/05 §4) ─────────────────────────────

  maps() {
    return {
      /** Browser map configuration: google → osm fallback. Only the referrer-restricted key leaves the server. */
      publicConfig: async (): Promise<{
        provider: 'osm' | 'google';
        tilesUrl?: string;
        attribution?: string;
        browserKey?: string;
        mapId?: string;
      }> => {
        const pref = (await this.settings.get('maps')).provider;
        if (pref === 'google') {
          const g = await this.store.resolve('maps.google');
          const browserKey = g.secrets.browserKey;
          if (g.row.enabled && g.row.health !== 'down' && browserKey) {
            return { provider: 'google', browserKey, ...(g.config.mapId ? { mapId: String(g.config.mapId) } : {}) };
          }
        }
        const osm = await this.store.resolve('maps.osm');
        return { provider: 'osm', tilesUrl: String(osm.config.tilesUrl), attribution: String(osm.config.attribution) };
      },
    };
  }

  places() {
    return {
      /** google → overpass → empty list with source "none" (docs/05 §1.7). */
      nearby: async (
        lat: number,
        lng: number,
        radius: number,
        cats: NearbyKey[],
      ): Promise<{ source: string; items: NearbyItem[] }> => {
        const order: string[] = [];
        if ((await this.settings.get('maps')).provider === 'google') order.push('places.google');
        order.push('places.overpass');
        for (const key of order) {
          const r = await this.store.resolve(key);
          if (!r.row.enabled) continue;
          try {
            if (key === 'places.google') {
              let serverKey = r.secrets.serverKey;
              if (!serverKey) serverKey = (await this.store.resolve('maps.google')).secrets.serverKey;
              if (!serverKey) continue;
              const items = await this.run(
                key,
                'nearby',
                (ctx) => googleNearby({ ...ctx, secrets: { serverKey } } as never, lat, lng, radius, cats),
                { idempotent: true, timeoutMs: 12_000 },
              );
              return { source: key, items };
            }
            const items = await this.run(key, 'nearby', (ctx) => overpassNearby(ctx as never, lat, lng, radius, cats), {
              idempotent: true,
              timeoutMs: 25_000,
            });
            return { source: key, items };
          } catch (e) {
            this.logger.warn({ key, err: (e as Error).message }, 'nearby provider failed, trying next');
          }
        }
        return { source: 'none', items: [] };
      },
    };
  }

  email() {
    return {
      isReady: async (): Promise<boolean> => {
        const r = await this.store.resolve('email.resend');
        return r.row.enabled && !!r.secrets.apiKey && !!r.config.fromEmail;
      },
      // Provider-idempotent (Idempotency-Key header), so it may be retried safely.
      send: (msg: OutgoingMessage) =>
        this.run('email.resend', 'sendEmail', (ctx) => resendSend(ctx as never, msg), { idempotent: true }),
      webhookSecret: async (): Promise<string | undefined> =>
        (await this.store.resolve('email.resend')).secrets.webhookSigningSecret,
    };
  }

  storage() {
    const k = 'storage.r2';
    return {
      presignPut: (bucket: BucketName, key: string, contentType: string, maxBytes: number) =>
        this.run(k, 'presignPut', (ctx) => r2PresignPut(ctx as never, bucket, key, contentType, maxBytes)),
      put: (bucket: BucketName, key: string, body: Buffer, contentType: string) =>
        this.run(k, 'put', (ctx) => r2Put(ctx as never, bucket, key, body, contentType), {
          idempotent: true,
          timeoutMs: 30_000,
        }),
      get: (bucket: BucketName, key: string, maxBytes: number) =>
        this.run(k, 'get', (ctx) => r2Get(ctx as never, bucket, key, maxBytes), {
          idempotent: true,
          timeoutMs: 30_000,
        }),
      isReady: async (): Promise<boolean> => {
        const r = await this.store.resolve(k);
        return r.row.enabled && !!r.config.accountId && !!r.secrets.accessKeyId && !!r.secrets.secretAccessKey;
      },
      signedGet: (bucket: BucketName, key: string, ttlSec: number) =>
        this.run(k, 'signedGet', (ctx) => r2SignedGet(ctx as never, bucket, key, ttlSec)),
      delete: (bucket: BucketName, key: string) =>
        this.run(k, 'delete', (ctx) => r2Delete(ctx as never, bucket, key), { idempotent: true }),
      publicUrl: async (key: string) => r2PublicUrl({ config: (await this.store.resolve(k)).config } as never, key),
    };
  }
}
