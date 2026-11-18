import { describe, it, expect } from 'vitest';
import { PropertyOffer, PropertyStatus } from '@prisma/client';
import { schemaData } from '@manzilah/schema';

// يضمن أن enums قاعدة البيانات تطابق مفاتيح المصدر المشترك (docs/01).
describe('prisma enums ↔ packages/schema', () => {
  it('PropertyOffer يطابق schema.offers', () => {
    expect(Object.keys(PropertyOffer).sort()).toEqual(Object.keys(schemaData.offers).sort());
  });

  it('PropertyStatus يطابق schema.statuses', () => {
    expect(Object.keys(PropertyStatus).sort()).toEqual(Object.keys(schemaData.statuses).sort());
  });

  it('قيم Property.type المسموحة = مفاتيح schema.types', () => {
    const allowed = Object.keys(schemaData.types);
    expect(allowed).toContain('villa');
    expect(allowed.length).toBe(12);
  });
});
