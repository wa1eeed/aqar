import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import { SYSTEM_ROLES } from '../src/common/auth/permissions';
import { hashPassword } from '../src/modules/auth/password';
import { base32Decode, hotp, TOTP_STEP_SEC } from '../src/modules/auth/totp';
import { EmailService } from '../src/modules/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS } from '../src/redis/redis.module';

let ipCounter = 10;
/** A distinct client IP per call (via the trusted proxy) so per-IP limits don't interfere. */
export const freshIp = () => `198.51.100.${(ipCounter = (ipCounter % 250) + 1)}`;

export function totpNow(secret: string, offsetSteps = 0): string {
  return hotp(base32Decode(secret), Math.floor(Date.now() / 1000 / TOTP_STEP_SEC) + offsetSteps);
}

export async function resetDb(app: NestExpressApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$transaction([
    prisma.paymentEvent.deleteMany(),
    prisma.bankTransferSubmission.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.bankAccount.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.savedSearch.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.viewing.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.property.deleteMany(), // NearbyCache/media cascade
    prisma.refreshToken.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.emailLog.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.staffUser.deleteMany(),
    prisma.role.deleteMany({ where: { isSystem: false } }),
    // Integrations back to defaults (e.g. email.resend disabled → emails captured in memory).
    prisma.integrationCallLog.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.integration.deleteMany(),
  ]);
  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: r.key },
      create: { key: r.key, nameAr: r.nameAr, permissions: r.permissions },
      update: { permissions: r.permissions },
    });
  }
  await app.get<Redis>(REDIS).flushdb();
  app.get(EmailService).captured.length = 0;
}

export async function createStaff(
  app: NestExpressApplication,
  roleKey: string,
  email: string,
  password: string,
  extra: { mustChangePassword?: boolean } = {},
) {
  const prisma = app.get(PrismaService);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  return prisma.staffUser.create({
    data: {
      name: `${roleKey} user`,
      email,
      passwordHash: await hashPassword(password),
      roleId: role.id,
      mustChangePassword: extra.mustChangePassword ?? false,
    },
  });
}

export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  const c = list.find((v) => v.startsWith(`${name}=`));
  if (!c) return null;
  const value = c.split(';')[0]!.slice(name.length + 1);
  return value.length ? value : null;
}

export function lastEmail(app: NestExpressApplication, to?: string) {
  const all = app.get(EmailService).captured.filter((m) => !to || m.to === to);
  return all[all.length - 1];
}
