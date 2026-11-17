import { Inject, Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { AppException } from '../../common/errors/app-exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { IntegrationsGateway } from '../integrations/gateway.service';

const MAX_READ_BYTES = 12 * 1024 * 1024;

/**
 * Private files (transfer receipts, payment receipts PDF). Production: the private R2 «uploads»
 * bucket through the gateway. Development and tests without R2: a local directory
 * (`backend/.uploads`, git-ignored) so the flows can be exercised; staging/production never fall
 * back to the local disk.
 */
@Injectable()
export class FileStore {
  private readonly localRoot = resolve(__dirname, '../../../.uploads');

  constructor(
    private readonly gateway: IntegrationsGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async useLocal(): Promise<boolean> {
    if (await this.gateway.storage().isReady()) return false;
    if (this.env.NODE_ENV === 'development' || this.env.NODE_ENV === 'test') return true;
    throw new AppException('STORAGE_NOT_CONFIGURED', 503, 'رفع الملفات غير متاح حالياً، حاول لاحقاً');
  }

  private localPath(key: string): string {
    const p = normalize(join(this.localRoot, key));
    if (!p.startsWith(this.localRoot)) throw new Error('invalid key');
    return p;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (await this.useLocal()) {
      const p = this.localPath(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body, { mode: 0o600 });
      return;
    }
    await this.gateway.storage().put('uploads', key, body, contentType);
  }

  async get(key: string): Promise<Buffer> {
    if (await this.useLocal()) return readFile(this.localPath(key));
    const r = await this.gateway.storage().get('uploads', key, MAX_READ_BYTES);
    return r.body;
  }
}
