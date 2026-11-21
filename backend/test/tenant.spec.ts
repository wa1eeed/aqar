import { describe, it, expect } from 'vitest';
import { applyTenantScope } from '../src/prisma/tenant-extension.js';
import { isTenantModel } from '../src/prisma/tenant-models.js';
import { formatCode, randomCode, yearTwoDigits } from '../src/common/code.js';

describe('tenant model classification', () => {
  it('النماذج المملوكة لمشترك تُعزَل، ونماذج المنصّة لا', () => {
    expect(isTenantModel('Property')).toBe(true);
    expect(isTenantModel('Booking')).toBe(true);
    expect(isTenantModel('Tenant')).toBe(false);
    expect(isTenantModel('Plan')).toBe(false);
    expect(isTenantModel('City')).toBe(false);
    expect(isTenantModel(undefined)).toBe(false);
  });
});

describe('applyTenantScope', () => {
  const T = 'tenant_123';

  it('create: يحقن tenantId في data', () => {
    const out = applyTenantScope('create', { data: { title: 'x' } }, T);
    expect(out.data).toMatchObject({ title: 'x', tenantId: T });
  });

  it('findMany: يضيف tenantId إلى where', () => {
    const out = applyTenantScope('findMany', { where: { status: 'available' } }, T);
    expect(out.where).toMatchObject({ status: 'available', tenantId: T });
  });

  it('findUnique: يضيف tenantId إلى where (extendedWhereUnique)', () => {
    const out = applyTenantScope('findUnique', { where: { id: 5 } }, T);
    expect(out.where).toMatchObject({ id: 5, tenantId: T });
  });

  it('upsert: يُقيّد where وينشئ بـ tenantId', () => {
    const out = applyTenantScope('upsert', { where: { id: 1 }, create: { a: 1 }, update: { a: 2 } }, T);
    expect(out.where).toMatchObject({ id: 1, tenantId: T });
    expect(out.create).toMatchObject({ a: 1, tenantId: T });
  });

  it('createMany: يحقن tenantId في كل عنصر', () => {
    const out = applyTenantScope('createMany', { data: [{ a: 1 }, { a: 2 }] }, T);
    expect(out.data).toEqual([
      { a: 1, tenantId: T },
      { a: 2, tenantId: T },
    ]);
  });

  it('tenantId للسياق يَغلب أي قيمة ممرّرة في data', () => {
    const out = applyTenantScope('create', { data: { tenantId: 'other', a: 1 } }, T);
    expect((out.data as { tenantId: string }).tenantId).toBe(T);
  });
});

describe('per-tenant code generator', () => {
  it('formatCode بصيغة PREFIX-YY-RAND6', () => {
    const code = formatCode('MZ');
    expect(code).toMatch(/^MZ-\d{2}-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(code.split('-')[1]).toBe(yearTwoDigits());
  });

  it('randomCode بالطول المطلوب وبلا محارف ملتبسة', () => {
    const c = randomCode(10);
    expect(c).toHaveLength(10);
    expect(c).not.toMatch(/[ILOU]/);
  });
});
