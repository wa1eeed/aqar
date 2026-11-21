import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../common/tenant/tenant-context.js';
import { createTenantExtension } from './tenant-extension.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * عميل معزول بالمشترك: يحقن tenantId تلقائياً (من TenantContext) على النماذج المملوكة.
   * خدمات المشتركين تستخدمه؛ خدمات المنصّة تستخدم العميل الأساسي مباشرةً.
   * النوع PrismaClient للراحة؛ السلوك الفعلي هو العميل الممتدّ.
   */
  readonly scoped: PrismaClient;

  constructor(private readonly tenantCtx: TenantContext) {
    super();
    this.scoped = this.$extends(
      createTenantExtension(() => this.tenantCtx.tenantId),
    ) as unknown as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('تم الاتصال بقاعدة البيانات');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
