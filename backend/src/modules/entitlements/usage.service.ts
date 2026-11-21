import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** عدّادات الاستهلاك (للحدود المقيسة والاستهلاك المدفوع). period=null تراكمي، أو YYYY-MM. */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string, key: string): Promise<number> {
    const row = await this.prisma.usageCounter.findUnique({ where: { tenantId_key: { tenantId, key } } });
    return row?.value ?? 0;
  }

  async increment(tenantId: string, key: string, by = 1, period: string | null = null): Promise<number> {
    const row = await this.prisma.usageCounter.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: by, period },
      update: { value: { increment: by } },
    });
    return row.value;
  }

  async decrement(tenantId: string, key: string, by = 1): Promise<void> {
    await this.prisma.usageCounter.updateMany({
      where: { tenantId, key, value: { gte: by } },
      data: { value: { decrement: by } },
    });
  }
}
