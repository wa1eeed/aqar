import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { mergeEntitlements, type EntitlementsService } from '../src/modules/entitlements/entitlements.service.js';
import { EntitlementGuard } from '../src/modules/entitlements/entitlement.guard.js';
import { FeatureNotIncludedException } from '../src/modules/entitlements/entitlement-errors.js';
import { FEATURE_CATALOG, isKnownFeature } from '../src/modules/entitlements/feature-catalog.js';
import type { TenantContext } from '../src/common/tenant/tenant-context.js';

describe('Feature catalog', () => {
  it('ميزات معروفة فقط', () => {
    expect(isKnownFeature('staff.max')).toBe(true);
    expect(isKnownFeature('auctions.enabled')).toBe(true);
    expect(isKnownFeature('nonexistent.feature')).toBe(false);
    expect(FEATURE_CATALOG.every((f) => f.key && f.type)).toBe(true);
  });
});

describe('mergeEntitlements', () => {
  it('تجاوزات المشترك تَغلب قيم الباقة', () => {
    const map = mergeEntitlements(
      [
        { featureKey: 'staff.max', value: 5 },
        { featureKey: 'auctions.enabled', value: false },
      ],
      [
        { featureKey: 'auctions.enabled', value: true },
        { featureKey: 'api.calls', value: 1000 },
      ],
    );
    expect(map).toEqual({ 'staff.max': 5, 'auctions.enabled': true, 'api.calls': 1000 });
  });
});

function ctx(): ExecutionContext {
  return { getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;
}
const tenant = { requireTenantId: () => 't1' } as unknown as TenantContext;

describe('EntitlementGuard', () => {
  it('بلا @RequireFeature → يسمح', async () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const ent = { assertFeature: async () => undefined } as unknown as EntitlementsService;
    const guard = new EntitlementGuard(reflector, ent, tenant);
    expect(await guard.canActivate(ctx())).toBe(true);
  });

  it('ميزة غير مشمولة → يرفض بـ FEATURE_NOT_INCLUDED', async () => {
    const reflector = { getAllAndOverride: () => 'auctions.enabled' } as unknown as Reflector;
    const ent = {
      assertFeature: async (_t: string, f: string) => {
        throw new FeatureNotIncludedException(f);
      },
    } as unknown as EntitlementsService;
    const guard = new EntitlementGuard(reflector, ent, tenant);
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(FeatureNotIncludedException);
  });
});
