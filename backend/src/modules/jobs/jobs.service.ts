import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { ReceiptsService } from '../bookings/receipts.service.js';

// مهام دورية تُشغَّل لكل مشترك نشط ضمن سياقه. (في التوسّع الأفقي تنتقل إلى عامل BullMQ واحد.)
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly bookings: BookingsService,
    private readonly receipts: ReceiptsService,
  ) {}

  private async forEachTenant(fn: () => Promise<void>): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null, status: { in: ['active', 'trial'] } },
      select: { id: true },
    });
    for (const t of tenants) {
      await this.tenant.run({ tenantId: t.id, platform: false }, fn).catch((e) => {
        this.logger.warn(`مهمة فشلت للمشترك ${t.id}: ${String(e)}`);
      });
    }
  }

  /** تحرير الحجوزات منتهية المهلة كل 5 دقائق (docs/04 §4). */
  @Cron('*/5 * * * *')
  async releaseExpiredHolds(): Promise<void> {
    await this.forEachTenant(async () => {
      const n = await this.bookings.releaseExpiredHolds();
      if (n > 0) this.logger.log(`حُرّرت ${n} حجوزات منتهية`);
    });
  }

  /**
   * توليد إيصالات PDF للدفعات المدفوعة حديثاً (آخر 24 ساعة) إن لم تُخزَّن بعد.
   * عزل: يعمل فقط حيث CHROMIUM_PATH مضبوط (العامل الخلفي)، فحاويات الـAPI لا تُشغّل متصفّحاً.
   */
  @Cron('*/5 * * * *')
  async generatePendingReceipts(): Promise<void> {
    if (!this.receipts.enabled) return;
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    await this.forEachTenant(async () => {
      const pays = await this.prisma.scoped.payment.findMany({
        where: { status: { in: ['paid', 'partially_refunded'] }, receiptNumber: { not: null }, paidAt: { gte: since } },
        select: { id: true },
      });
      for (const p of pays) {
        await this.receipts.ensure(p.id).catch((e) => this.logger.warn(`إيصال ${p.id} فشل: ${String(e)}`));
      }
    });
  }
}
