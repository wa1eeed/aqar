import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { IntegrationsService } from '../integrations/integrations.service.js';

/**
 * ملفّات خاصّة (إيصالات الدفع PDF). الإنتاج: دلو R2 «uploads» الخاصّ عبر البوّابة.
 * التطوير/الاختبارات بلا R2: مجلّد محلّي `.uploads`. المفاتيح تحمل tenantId للعزل.
 */
@Injectable()
export class FileStore {
  private readonly localRoot = resolve(process.cwd(), '.uploads');

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
  ) {}

  private useLocal(): boolean {
    return !this.config.get<string>('R2_ACCESS_KEY_ID');
  }

  private localPath(key: string): string {
    const p = normalize(join(this.localRoot, key));
    if (!p.startsWith(this.localRoot)) throw new Error('invalid key');
    return p;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.useLocal()) {
      const p = this.localPath(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body, { mode: 0o600 });
      return;
    }
    await this.integrations.storagePut('uploads', key, body, contentType);
  }

  async get(key: string): Promise<Buffer> {
    if (this.useLocal()) return readFile(this.localPath(key));
    return this.integrations.storageGet('uploads', key);
  }
}
