/**
 * Re-encrypts every encrypted column with a new APP_ENCRYPTION_KEY (docs/10 §1):
 *   pnpm cli rotate-encryption-key --new <base64-32-bytes>
 * Run with the CURRENT key in APP_ENCRYPTION_KEY. Afterwards deploy with APP_ENCRYPTION_KEY=<new>
 * (and APP_ENCRYPTION_KEY_PREVIOUS=<old> briefly, so in-flight values still decrypt).
 * Everything happens in one transaction: either all rows move to the new key or none do.
 */
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../modules/crypto/encryption.service';

export async function rotateEncryptionKey(
  currentKey: string,
  newKey: string,
  prisma = new PrismaClient(),
): Promise<{ integrations: number; totp: number }> {
  if (Buffer.from(newKey, 'base64').length !== 32)
    throw new Error('--new must be 32 bytes, base64 (openssl rand -base64 32)');
  if (newKey === currentKey) throw new Error('the new key equals the current key');
  const oldKey = Buffer.from(currentKey, 'base64');
  const nextKey = Buffer.from(newKey, 'base64');
  const reencrypt = (payload: Uint8Array, aad: string) =>
    EncryptionService.encryptWith(nextKey, EncryptionService.decryptWith(oldKey, Buffer.from(payload), aad), aad);

  return prisma.$transaction(
    async (tx) => {
      let integrations = 0;
      let totp = 0;
      for (const row of await tx.integration.findMany({ where: { secretsEnc: { not: null } } })) {
        await tx.integration.update({
          where: { key: row.key },
          data: { secretsEnc: reencrypt(row.secretsEnc!, `integration:${row.key}`) },
        });
        integrations++;
      }
      for (const row of await tx.staffUser.findMany({
        where: { totpSecretEnc: { not: null } },
        select: { id: true, totpSecretEnc: true },
      })) {
        await tx.staffUser.update({
          where: { id: row.id },
          data: { totpSecretEnc: reencrypt(row.totpSecretEnc!, `totp:${row.id}`) },
        });
        totp++;
      }
      return { integrations, totp };
    },
    { timeout: 120_000 },
  );
}
