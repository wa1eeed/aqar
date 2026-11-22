import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { RESERVED_SLUGS } from '../../common/tenant/tenant-resolver.middleware.js';
import { provisionTenantDefaults } from './tenant-provisioning.js';

// نموذج تسجيل المكاتب/الوسطاء/الشركات العقارية (تسجيل ذاتي عام).
export const registerOfficeSchema = z.object({
  officeName: z.string().trim().min(2).max(120),
  officeType: z.enum(['broker', 'office', 'company']),
  commercialReg: z.string().trim().max(30).optional(),
  falLicense: z.string().trim().max(40).optional(),
  city: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'النطاق الفرعي: أحرف لاتينية صغيرة وأرقام وشرطات فقط'),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^(?:\+?966|0)5\d{8}$/, 'رقم جوال سعودي غير صحيح'),
  password: z.string().min(8).max(128),
  planKey: z.enum(['trial', 'basic', 'pro']).default('trial'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'يجب الموافقة على الشروط' }) }),
});

export type RegisterOfficeInput = z.infer<typeof registerOfficeSchema>;

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** يولّد كوداً فريداً للمكتب من النطاق الفرعي (حروف لاتينية كبيرة، 2–6). */
  private async uniqueCode(base: string): Promise<string> {
    const letters = base.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const seed = (letters.slice(0, 3) || 'AQ').padEnd(2, 'X');
    for (let i = 0; i < 30; i++) {
      const code = (i === 0 ? seed : `${seed.slice(0, 2)}${randomInt(10, 99)}`).slice(0, 6);
      const clash = await this.prisma.tenant.findUnique({ where: { code }, select: { id: true } });
      if (!clash) return code;
    }
    throw new ConflictException('تعذّر توليد كود للمكتب، جرّب نطاقاً فرعياً مختلفاً');
  }

  async register(input: unknown) {
    const data = registerOfficeSchema.parse(input);

    if (RESERVED_SLUGS.has(data.slug)) {
      throw new BadRequestException('هذا النطاق الفرعي محجوز، اختر اسماً آخر');
    }
    const slugClash = await this.prisma.tenant.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (slugClash) throw new ConflictException('النطاق الفرعي مستخدم بالفعل، اختر اسماً آخر');

    const code = await this.uniqueCode(data.slug);
    const localDigits = data.phone.replace(/\D/g, '').replace(/^966/, '').replace(/^0/, '');
    const phone = `+966${localDigits}`;

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug: data.slug,
          code,
          name: data.officeName,
          status: 'pending',
          planKey: data.planKey,
          officeType: data.officeType,
          commercialReg: data.commercialReg || null,
          falLicense: data.falLicense || null,
          city: data.city,
          phone,
          contactName: data.contactName,
          ownerName: data.contactName,
          ownerEmail: data.email,
        },
      });
      await provisionTenantDefaults(tx, created.id, {
        name: data.contactName,
        email: data.email,
        password: data.password,
      });
      const plan = await tx.plan.findUnique({ where: { key: data.planKey } });
      if (plan) {
        await tx.subscription.create({
          data: { tenantId: created.id, planId: plan.id, status: 'trialing' },
        });
      }
      return created;
    });

    await this.audit.record({
      tenantId: null,
      actorType: 'system',
      actorId: null,
      action: 'tenant.register',
      entityType: 'Tenant',
      entityId: tenant.id,
      after: {
        slug: data.slug,
        name: data.officeName,
        officeType: data.officeType,
        planKey: data.planKey,
        status: 'pending',
      },
    });

    return {
      ok: true,
      status: 'pending',
      office: { id: tenant.id, name: tenant.name, slug: tenant.slug, code: tenant.code },
      message: 'تم استلام طلب انضمام مكتبك وهو قيد المراجعة والتفعيل.',
    };
  }
}
