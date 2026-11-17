import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import type { ProviderCtx, ProviderDefinition } from '../types';
import { IntegrationError } from '../types';
import { ident, optionalUrl, rateLimit, secret } from './common';

const bucket = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'invalid_bucket');

export const r2Config = z
  .object({
    accountId: ident(64),
    uploadsBucket: bucket.default('uploads'),
    mediaBucket: bucket.default('media'),
    publicBaseUrl: optionalUrl,
    rateLimitPerMin: rateLimit,
  })
  .strict();
export const r2Secrets = z
  .object({ accessKeyId: secret(128), secretAccessKey: secret(256) })
  .partial()
  .strict();
type Ctx = ProviderCtx<z.output<typeof r2Config>, z.output<typeof r2Secrets>>;

export type BucketName = 'uploads' | 'media';

/** Object keys we generate are random; still, never accept traversal or odd characters. */
export function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,500}$/.test(key) || key.includes('..') || key.includes('//')) {
    throw new IntegrationError('INTEGRATION_BAD_RESPONSE', 'unsafe object key');
  }
}

export function r2Client(ctx: Ctx): { client: S3Client; bucket(b: BucketName): string } {
  const { accessKeyId, secretAccessKey } = ctx.secrets;
  if (!ctx.config.accountId || !accessKeyId || !secretAccessKey) {
    throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'r2 not configured');
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${ctx.config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    // R2 rejects the SDK's default flexible checksums; a presigned PUT must not carry the CRC32 of an
    // empty body, otherwise every real upload fails the checksum.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 1, // retries are decided by the gateway
  });
  return { client, bucket: (b) => (b === 'uploads' ? ctx.config.uploadsBucket : ctx.config.mediaBucket) };
}

/** Presigned PUT bound to content type and exact length (the client cannot upload more). */
export async function r2PresignPut(
  ctx: Ctx,
  b: BucketName,
  key: string,
  contentType: string,
  bytes: number,
  ttlSec = 600,
) {
  assertSafeKey(key);
  const { client, bucket: name } = r2Client(ctx);
  const cmd = new PutObjectCommand({ Bucket: name(b), Key: key, ContentType: contentType, ContentLength: bytes });
  const url = await getSignedUrl(client, cmd, {
    expiresIn: ttlSec,
    signableHeaders: new Set(['content-type', 'content-length']),
  });
  return { url, headers: { 'Content-Type': contentType, 'Content-Length': String(bytes) } };
}

export async function r2Put(ctx: Ctx, b: BucketName, key: string, body: Buffer, contentType: string): Promise<void> {
  assertSafeKey(key);
  const { client, bucket: name } = r2Client(ctx);
  await client.send(new PutObjectCommand({ Bucket: name(b), Key: key, Body: body, ContentType: contentType }), {
    abortSignal: ctx.signal,
  });
}

export async function r2SignedGet(ctx: Ctx, b: BucketName, key: string, ttlSec: number): Promise<string> {
  assertSafeKey(key);
  const { client, bucket: name } = r2Client(ctx);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: name(b), Key: key }), {
    expiresIn: Math.min(ttlSec, 3600),
  });
}

export async function r2Delete(ctx: Ctx, b: BucketName, key: string): Promise<void> {
  assertSafeKey(key);
  const { client, bucket: name } = r2Client(ctx);
  await client.send(new DeleteObjectCommand({ Bucket: name(b), Key: key }), { abortSignal: ctx.signal });
}

export function r2PublicUrl(ctx: Ctx, key: string): string {
  assertSafeKey(key);
  if (!ctx.config.publicBaseUrl) throw new IntegrationError('INTEGRATION_NOT_CONFIGURED', 'r2 public base url missing');
  return `${ctx.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

export const r2Storage: ProviderDefinition<typeof r2Config, typeof r2Secrets> = {
  key: 'storage.r2',
  category: 'storage',
  nameAr: 'Cloudflare R2',
  descriptionAr: 'تخزين الصور والملفات',
  docsUrl: 'https://developers.cloudflare.com/r2/',
  configSchema: r2Config,
  secretsSchema: r2Secrets,
  uiHints: {
    accountId: { labelAr: 'Account ID' },
    uploadsBucket: { labelAr: 'حاوية الرفع الخاصة (uploads)', helpAr: 'خاصة — للإيصالات والمستندات' },
    mediaBucket: { labelAr: 'حاوية الصور العامة (media)' },
    publicBaseUrl: { labelAr: 'رابط CDN العام', type: 'url', placeholder: 'https://cdn.example.sa' },
    accessKeyId: { labelAr: 'Access Key ID' },
    secretAccessKey: { labelAr: 'Secret Access Key' },
  },
  supportsSandbox: false,
  async testConnection(ctx) {
    const { client, bucket } = r2Client(ctx);
    for (const b of ['uploads', 'media'] as const) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket(b) }), { abortSignal: ctx.signal });
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        return {
          ok: false,
          messageAr: status === 403 ? 'المفاتيح لا تملك صلاحية الوصول للحاوية' : `الحاوية ${bucket(b)} غير متاحة`,
          details: { status },
        };
      }
    }
    return { ok: true, messageAr: 'تم الاتصال بالحاويتين بنجاح' };
  },
};
