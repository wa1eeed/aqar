import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import type { StorageBucket } from '../capabilities.js';
import type { ProviderCtx, ProviderDefinition } from '../provider-definition.js';

const configSchema = z.object({
  accountId: z.string().min(1),
  uploadsBucket: z.string().default('uploads'),
  mediaBucket: z.string().default('media'),
  publicBaseUrl: z.string().url(),
});
type Config = z.infer<typeof configSchema>;

const secretsSchema = z.object({
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});
type Secrets = z.infer<typeof secretsSchema>;

export const r2Provider: ProviderDefinition<Config, Secrets> = {
  key: 'storage.r2',
  category: 'storage',
  scope: 'platform',
  nameAr: 'تخزين Cloudflare R2',
  descriptionAr: 'تخزين موحّد لصور العقارات (مجلد لكل مشترك).',
  docsUrl: 'https://developers.cloudflare.com/r2/',
  configSchema,
  secretsSchema,
  uiHints: {
    accountId: { labelAr: 'معرّف الحساب', type: 'text' },
    uploadsBucket: { labelAr: 'دلو الرفع', type: 'text' },
    mediaBucket: { labelAr: 'دلو الوسائط العام', type: 'text' },
    publicBaseUrl: { labelAr: 'رابط CDN العام', type: 'url', placeholder: 'https://cdn.example.com' },
    accessKeyId: { labelAr: 'Access Key ID', type: 'password' },
    secretAccessKey: { labelAr: 'Secret Access Key', type: 'password' },
  },
  supportsSandbox: false,
  async testConnection(ctx) {
    try {
      const client = makeClient(ctx);
      await client.send(new HeadBucketCommand({ Bucket: ctx.config.mediaBucket }));
      return { ok: true, messageAr: 'تم الوصول إلى دلو R2' };
    } catch (err) {
      return { ok: false, messageAr: 'تعذّر الوصول إلى R2', details: String(err) };
    }
  },
};

function makeClient(ctx: ProviderCtx<Config, Secrets>): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ctx.config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ctx.secrets.accessKeyId,
      secretAccessKey: ctx.secrets.secretAccessKey,
    },
  });
}

function bucketName(ctx: ProviderCtx<Config, Secrets>, bucket: StorageBucket): string {
  return bucket === 'uploads' ? ctx.config.uploadsBucket : ctx.config.mediaBucket;
}

export const r2Storage = {
  async presignPut(
    ctx: ProviderCtx<Config, Secrets>,
    bucket: StorageBucket,
    key: string,
    contentType: string,
    maxBytes: number,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const client = makeClient(ctx);
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucketName(ctx, bucket),
        Key: key,
        ContentType: contentType,
        ContentLength: maxBytes,
      }),
      { expiresIn: 600 },
    );
    return { url, headers: { 'Content-Type': contentType } };
  },

  async signedGet(
    ctx: ProviderCtx<Config, Secrets>,
    bucket: StorageBucket,
    key: string,
    ttlSec: number,
  ): Promise<string> {
    const client = makeClient(ctx);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName(ctx, bucket), Key: key }), {
      expiresIn: ttlSec,
    });
  },

  async delete(ctx: ProviderCtx<Config, Secrets>, bucket: StorageBucket, key: string): Promise<void> {
    const client = makeClient(ctx);
    await client.send(new DeleteObjectCommand({ Bucket: bucketName(ctx, bucket), Key: key }));
  },

  publicUrl(ctx: ProviderCtx<Config, Secrets>, key: string): string {
    return `${ctx.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  },
};

export type { Config as R2Config, Secrets as R2Secrets };
