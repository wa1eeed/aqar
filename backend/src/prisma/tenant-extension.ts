import { Prisma } from '@prisma/client';
import { isTenantModel } from './tenant-models.js';

type Args = Record<string, unknown>;

function scopeData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => ({ ...(d as object), tenantId }));
  return { ...((data as object) ?? {}), tenantId };
}

/**
 * دالة نقية: تضيف قيد tenantId إلى وسائط أي عملية Prisma على نموذج مملوك لمشترك.
 * - create و createMany و جزء create من upsert: تُحقن tenantId في data.
 * - بقية العمليات (find و count و aggregate و groupBy و update و delete و upsert): تُضاف tenantId إلى where.
 *   (Prisma 5 يسمح بحقول إضافية في where الخاص بـ findUnique عبر extendedWhereUnique.)
 */
export function applyTenantScope(operation: string, args: Args | undefined, tenantId: string): Args {
  const a: Args = { ...(args ?? {}) };
  switch (operation) {
    case 'create':
      a.data = scopeData(a.data, tenantId);
      return a;
    case 'createMany':
    case 'createManyAndReturn':
      a.data = Array.isArray(a.data)
        ? a.data.map((d) => ({ ...(d as object), tenantId }))
        : scopeData(a.data, tenantId);
      return a;
    case 'upsert':
      a.where = { ...((a.where as object) ?? {}), tenantId };
      a.create = scopeData(a.create, tenantId);
      return a;
    default:
      // find*, count, aggregate, groupBy, update, updateMany, delete, deleteMany
      a.where = { ...((a.where as object) ?? {}), tenantId };
      return a;
  }
}

/**
 * امتداد Prisma يفرض عزل المشتركين: يقرأ tenantId من السياق (getTenantId) ويطبّقه على كل
 * عملية على نموذج مملوك. استعلام بلا سياق مشترك على نموذج مملوك = خطأ (منع تسريب عابر للمشتركين).
 */
export function createTenantExtension(getTenantId: () => string | null) {
  return Prisma.defineExtension({
    name: 'tenant-guard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!isTenantModel(model)) return query(args);
          const tenantId = getTenantId();
          if (!tenantId) {
            throw new Error(`استعلام على ${model} بلا سياق مشترك (tenant) — مرفوض.`);
          }
          const scoped = applyTenantScope(operation, args as Args, tenantId);
          return query(scoped);
        },
      },
    },
  });
}
