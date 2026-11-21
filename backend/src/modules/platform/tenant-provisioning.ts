import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES } from '../roles/permissions.js';
import { allDefaults, SETTINGS_SECTION_KEYS } from '../settings/schemas/index.js';

// تكاملات المشترك (لكل مكتب مفاتيحه)؛ تكاملات المنصّة (R2/Resend/OSM) منفصلة.
export const TENANT_INTEGRATION_REGISTRY: { key: string; category: string }[] = [
  { key: 'payments.moyasar', category: 'payments' },
  { key: 'payments.rize', category: 'payments' },
  { key: 'gov.rega', category: 'government' },
  { key: 'gov.ejar', category: 'government' },
  { key: 'gov.nafith', category: 'government' },
  { key: 'identity.nafath', category: 'identity' },
  { key: 'maps.google', category: 'maps' },
  { key: 'places.google', category: 'places' },
];

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * يُهيّئ البيانات الأساسية لمشترك جديد داخل معاملة: الأدوار النظامية، الإعدادات الافتراضية،
 * سجلّ تكاملات المشترك، والمالك (owner). يُستخدم من لوحة السوبر-أدمن ومن البذر.
 * يعيد كلمة مرور المالك المؤقّتة (لإرسال دعوة لاحقاً) إن لم تُمرَّر.
 */
export async function provisionTenantDefaults(
  tx: Tx,
  tenantId: string,
  owner: { name: string; email: string; password?: string },
): Promise<{ ownerUserId: string; tempPassword: string | null }> {
  // الأدوار النظامية
  for (const role of SYSTEM_ROLES) {
    await tx.role.upsert({
      where: { tenantId_key: { tenantId, key: role.key } },
      create: { tenantId, key: role.key, nameAr: role.nameAr, isSystem: true, permissions: role.permissions },
      update: { nameAr: role.nameAr, isSystem: true, permissions: role.permissions },
    });
  }

  // الإعدادات الافتراضية
  const defaults = allDefaults();
  for (const key of SETTINGS_SECTION_KEYS) {
    await tx.settingsSection.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: defaults[key] as object },
      update: {},
    });
  }

  // سجلّ تكاملات المشترك (معطّلة)
  for (const row of TENANT_INTEGRATION_REGISTRY) {
    await tx.integration.upsert({
      where: { tenantId_key: { tenantId, key: row.key } },
      create: { tenantId, key: row.key, category: row.category, enabled: false },
      update: { category: row.category },
    });
  }

  // المالك
  const ownerRole = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: 'owner' } } });
  if (!ownerRole) throw new Error('دور المالك غير موجود بعد التهيئة');

  const tempPassword = owner.password ? null : randomBytes(9).toString('base64url');
  const passwordHash = await argon2.hash(owner.password ?? tempPassword!, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
  });

  const ownerUser = await tx.staffUser.upsert({
    where: { tenantId_email: { tenantId, email: owner.email } },
    create: { tenantId, name: owner.name, email: owner.email, passwordHash, roleId: ownerRole.id, title: 'المالك' },
    update: { roleId: ownerRole.id },
  });

  return { ownerUserId: ownerUser.id, tempPassword };
}
