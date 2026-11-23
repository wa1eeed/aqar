import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { FEATURE_CATALOG, isKnownFeature } from '../entitlements/feature-catalog.js';

const entitlementValue = z.union([z.boolean(), z.number(), z.null()]);

export const createPlanSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  nameAr: z.string().min(2).max(60),
  priceMonthly: z.number().int().nonnegative().default(0),
  sort: z.number().int().optional(),
});

const entitlementsSchema = z.object({
  entitlements: z.array(z.object({ featureKey: z.string(), value: entitlementValue })),
});

const tenantEntitlementSchema = z.object({
  featureKey: z.string(),
  value: entitlementValue,
  expiresAt: z.string().datetime().nullable().optional(),
});

const setTenantPlanSchema = z.object({
  planKey: z.string(),
  // عدد أيام الاشتراك من الآن (اختياري — للتجديد/التفعيل). بدونه يبقى تاريخ الانتهاء كما هو.
  periodDays: z.number().int().positive().max(3650).optional(),
});

function toJson(value: boolean | number | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value;
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** سجلّ الميزات المتاحة برمجياً (طبقة القدرات). */
  listFeatures() {
    return FEATURE_CATALOG;
  }

  listPlans() {
    return this.prisma.plan.findMany({ include: { entitlements: true }, orderBy: { sort: 'asc' } });
  }

  async createPlan(input: unknown, actorId?: string | null) {
    const data = createPlanSchema.parse(input);
    const clash = await this.prisma.plan.findUnique({ where: { key: data.key } });
    if (clash) throw new ConflictException('مفتاح الباقة مستخدم');
    const plan = await this.prisma.plan.create({ data });
    await this.audit.record({
      tenantId: null, actorType: 'platform', actorId: actorId ?? null,
      action: 'plan.create', entityType: 'Plan', entityId: plan.id, after: { key: data.key },
    });
    return plan;
  }

  /** يضبط استحقاقات باقة (ميزات معروفة فقط من السجل). */
  async setPlanEntitlements(planId: string, body: unknown, actorId?: string | null) {
    const { entitlements } = entitlementsSchema.parse(body);
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new BadRequestException('الباقة غير موجودة');
    for (const e of entitlements) {
      if (!isKnownFeature(e.featureKey)) throw new BadRequestException(`ميزة غير معروفة: ${e.featureKey}`);
      await this.prisma.planEntitlement.upsert({
        where: { planId_featureKey: { planId, featureKey: e.featureKey } },
        create: { planId, featureKey: e.featureKey, value: toJson(e.value) },
        update: { value: toJson(e.value) },
      });
    }
    await this.audit.record({
      tenantId: null, actorType: 'platform', actorId: actorId ?? null,
      action: 'plan.entitlements.update', entityType: 'Plan', entityId: planId,
      after: { count: entitlements.length },
    });
    return this.prisma.planEntitlement.findMany({ where: { planId } });
  }

  /** استثناء/إضافة (add-on) لمشترك معيّن تَغلب الباقة. */
  async setTenantEntitlement(tenantId: string, body: unknown, actorId?: string | null) {
    const data = tenantEntitlementSchema.parse(body);
    if (!isKnownFeature(data.featureKey)) throw new BadRequestException(`ميزة غير معروفة: ${data.featureKey}`);
    const saved = await this.prisma.tenantEntitlement.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey: data.featureKey } },
      create: {
        tenantId, featureKey: data.featureKey, value: toJson(data.value),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null, updatedById: actorId ?? null,
      },
      update: {
        value: toJson(data.value),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null, updatedById: actorId ?? null,
      },
    });
    await this.audit.record({
      tenantId, actorType: 'platform', actorId: actorId ?? null,
      action: 'tenant.entitlement.update', entityType: 'TenantEntitlement', entityId: data.featureKey,
    });
    return saved;
  }

  tenantEntitlements(tenantId: string) {
    return this.prisma.tenantEntitlement.findMany({ where: { tenantId } });
  }

  /** تغيير/ترقية باقة مشترك (وتجديد الاشتراك اختيارياً، ويُفعّل حساباً معلّقاً/موقوفاً). */
  async setTenantPlan(tenantId: string, body: unknown, actorId?: string | null) {
    const { planKey, periodDays } = setTenantPlanSchema.parse(body);
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw new BadRequestException('باقة غير معروفة');
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundException('المشترك غير موجود');

    const currentPeriodEnd = periodDays ? new Date(Date.now() + periodDays * 86_400_000) : undefined;
    const sub = await this.prisma.subscription.upsert({
      where: { tenantId },
      create: { tenantId, planId: plan.id, status: 'active', currentPeriodEnd: currentPeriodEnd ?? null },
      update: { planId: plan.id, status: 'active', ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}) },
    });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        planKey: plan.key,
        ...(tenant.status === 'pending' || tenant.status === 'suspended' ? { status: 'active' as const } : {}),
      },
    });
    await this.audit.record({
      tenantId: null, actorType: 'platform', actorId: actorId ?? null,
      action: 'tenant.plan.change', entityType: 'Tenant', entityId: tenantId,
      after: { planKey, periodDays: periodDays ?? null },
    });
    return sub;
  }
}
