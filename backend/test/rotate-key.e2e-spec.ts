import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { rotateEncryptionKey } from '../src/cli/rotate-encryption-key';
import { DecryptionError, EncryptionService } from '../src/modules/crypto/encryption.service';

describe('rotate-encryption-key (docs/10 §1)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('re-encrypts integration secrets with the new key, atomically', async () => {
    const current = process.env.APP_ENCRYPTION_KEY!;
    const next = randomBytes(32).toString('base64');
    const oldSvc = new EncryptionService({ APP_ENCRYPTION_KEY: current, APP_ENCRYPTION_KEY_PREVIOUS: undefined });
    const newSvc = new EncryptionService({ APP_ENCRYPTION_KEY: next, APP_ENCRYPTION_KEY_PREVIOUS: undefined });

    await prisma.integration.upsert({
      where: { key: 'sms.taqnyat' },
      create: {
        key: 'sms.taqnyat',
        category: 'sms',
        secretsEnc: oldSvc.encryptJson({ apiKey: 'taqnyat-secret-1' }, 'integration:sms.taqnyat'),
      },
      update: { secretsEnc: oldSvc.encryptJson({ apiKey: 'taqnyat-secret-1' }, 'integration:sms.taqnyat') },
    });

    await expect(rotateEncryptionKey(current, 'too-short', prisma)).rejects.toThrow(/32 bytes/);
    const r = await rotateEncryptionKey(current, next, prisma);
    expect(r.integrations).toBeGreaterThanOrEqual(1);

    const row = await prisma.integration.findUniqueOrThrow({ where: { key: 'sms.taqnyat' } });
    expect(newSvc.decryptJson(row.secretsEnc!, 'integration:sms.taqnyat')).toEqual({ apiKey: 'taqnyat-secret-1' });
    expect(() => oldSvc.decrypt(row.secretsEnc!, 'integration:sms.taqnyat')).toThrow(DecryptionError);

    // Rotating again with the wrong "current" key fails without touching anything.
    await expect(rotateEncryptionKey(current, randomBytes(32).toString('base64'), prisma)).rejects.toThrow();
    const after = await prisma.integration.findUniqueOrThrow({ where: { key: 'sms.taqnyat' } });
    expect(after.secretsEnc!.equals(row.secretsEnc!)).toBe(true);
    await prisma.integration.delete({ where: { key: 'sms.taqnyat' } });
  });
});
