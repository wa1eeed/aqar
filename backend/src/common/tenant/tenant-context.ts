import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface TenantStore {
  /** معرّف المشترك للطلب الحالي؛ null لطلبات المنصّة (السوبر-أدمن). */
  tenantId: string | null;
  /** صحيح إذا كان الطلب في نطاق المنصّة (platform) لا مشترك. */
  platform: boolean;
}

/**
 * سياق المشترك عبر AsyncLocalStorage — يحمل tenantId عبر كامل دورة الطلب،
 * فتعتمد عليه خدمات الأعمال وامتداد Prisma للعزل دون تمرير tenantId يدوياً.
 */
@Injectable()
export class TenantContext {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  get store(): TenantStore | undefined {
    return this.als.getStore();
  }

  get tenantId(): string | null {
    return this.als.getStore()?.tenantId ?? null;
  }

  get isPlatform(): boolean {
    return this.als.getStore()?.platform ?? false;
  }

  /** يعيد tenantId أو يرمي خطأ — للمسارات التي تتطلّب مشتركاً. */
  requireTenantId(): string {
    const id = this.tenantId;
    if (!id) throw new Error('لا يوجد سياق مشترك (tenant) للطلب الحالي');
    return id;
  }

  /** يضبط معرّف المشترك للطلب الحالي (مثلاً من توكن الموظف في الدخول الموحّد). */
  setTenantId(id: string): void {
    const store = this.als.getStore();
    if (store) store.tenantId = id;
  }
}
