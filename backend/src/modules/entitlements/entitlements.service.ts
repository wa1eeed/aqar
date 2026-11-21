import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FeatureNotIncludedException, LimitReachedException } from './entitlement-errors.js';

export type EntitlementValue = boolean | number | null;
export type EntitlementMap = Record<string, EntitlementValue>;

interface Entry {
  featureKey: string;
  value: unknown;
}

/** دالة نقية: تدمج استحقاقات الباقة مع تجاوزات المشترك (الأخيرة تَغلب). */
export function mergeEntitlements(plan: Entry[], overrides: Entry[]): EntitlementMap {
  const map: EntitlementMap = {};
  for (const e of plan) map[e.featureKey] = e.value as EntitlementValue;
  for (const o of overrides) map[o.featureKey] = o.value as EntitlementValue;
  return map;
}

/**
 * محرّك الاستحقاقات: يقرّر ما تستحقّه باقة المشترك وحدوده. مفصول عن RBAC (الصلاحيات)
 * وعن الفوترة. الفرض مركزي على الخادم (Build once, package dynamically, enforce centrally).
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string): Promise<EntitlementMap> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: { include: { entitlements: true } } },
    });
    const planEntries: Entry[] = sub?.plan?.entitlements ?? [];
    const overrides = await this.prisma.tenantEntitlement.findMany({
      where: { tenantId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    return mergeEntitlements(planEntries, overrides);
  }

  async isEnabled(tenantId: string, featureKey: string): Promise<boolean> {
    return (await this.resolve(tenantId))[featureKey] === true;
  }

  /** الحدّ العددي؛ null = بلا حدّ (أو غير محدّد في الباقة). */
  async getLimit(tenantId: string, featureKey: string): Promise<number | null> {
    const v = (await this.resolve(tenantId))[featureKey];
    return typeof v === 'number' ? v : null;
  }

  async assertFeature(tenantId: string, featureKey: string): Promise<void> {
    if (!(await this.isEnabled(tenantId, featureKey))) throw new FeatureNotIncludedException(featureKey);
  }

  /** يرمي LimitReached إذا بلغ الاستخدام الحالي الحدّ (null = بلا حدّ). */
  async assertWithinLimit(tenantId: string, featureKey: string, current: number): Promise<void> {
    const limit = await this.getLimit(tenantId, featureKey);
    if (limit !== null && current >= limit) throw new LimitReachedException(featureKey, limit);
  }
}
