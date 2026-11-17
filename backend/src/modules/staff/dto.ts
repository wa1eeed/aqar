import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/auth/permissions';
import { email, plainText, saudiMobileE164 } from '../../common/security/zod-helpers';
import { boundedArray } from '../../common/security/zod-helpers';

const profile = {
  name: plainText(80).pipe(z.string().min(2)),
  phone: saudiMobileE164.optional(),
  whatsapp: z.union([z.literal(''), z.string().regex(/^9665\d{8}$/, 'invalid_whatsapp')]).optional(),
  title: plainText(80).optional(),
  falLicense: z.union([z.literal(''), z.string().regex(/^\d{6,15}$/, 'invalid_number')]).optional(),
  showOnWebsite: z.boolean().optional(),
};

export class InviteStaffDto extends createZodDto(
  z.object({ ...profile, email, roleId: z.string().min(1).max(40) }).strict(),
) {}

export class UpdateStaffDto extends createZodDto(
  z
    .object({
      name: profile.name.optional(),
      phone: profile.phone,
      whatsapp: profile.whatsapp,
      title: profile.title,
      falLicense: profile.falLicense,
      showOnWebsite: profile.showOnWebsite,
      roleId: z.string().min(1).max(40).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
) {}

const permission = z.enum(PERMISSIONS);
export class CreateRoleDto extends createZodDto(
  z
    .object({
      nameAr: plainText(60).pipe(z.string().min(2)),
      permissions: boundedArray(permission, PERMISSIONS.length),
    })
    .strict(),
) {}
export class UpdateRoleDto extends createZodDto(
  z
    .object({
      nameAr: plainText(60).pipe(z.string().min(2)).optional(),
      permissions: boundedArray(permission, PERMISSIONS.length).optional(),
    })
    .strict(),
) {}
