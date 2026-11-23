import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type ReportKind = 'leads' | 'bookings' | 'payments' | 'listings';
const KINDS: ReportKind[] = ['leads', 'bookings', 'payments', 'listings'];

export interface Report {
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** مؤشرات لوحة المكتب الحيّة. */
  async dashboard() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const p = this.prisma.scoped;
    const [propertiesTotal, propertiesPublished, leadsToday, viewingsUpcoming, bookingsMonth, paySum, transfersPending] =
      await Promise.all([
        p.property.count({}),
        p.property.count({ where: { visibility: 'published' } }),
        p.lead.count({ where: { createdAt: { gte: startOfDay } } }),
        p.viewing.count({ where: { scheduledAt: { gte: now }, status: { in: ['requested', 'confirmed'] } } }),
        p.booking.count({ where: { createdAt: { gte: startOfMonth } } }),
        p.payment.aggregate({ _sum: { amount: true }, where: { status: 'paid', paidAt: { gte: startOfMonth } } }),
        p.payment.count({ where: { method: 'bank_transfer', status: 'under_review' } }),
      ]);
    return {
      propertiesTotal,
      propertiesPublished,
      leadsToday,
      viewingsUpcoming,
      bookingsMonth,
      paymentsMonth: Number(paySum._sum.amount ?? 0n),
      transfersPending,
    };
  }

  async run(kind: string, from?: string, to?: string): Promise<Report> {
    if (!KINDS.includes(kind as ReportKind)) throw new BadRequestException('نوع تقرير غير معروف');
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    const createdAt = from || to ? range : undefined;

    if (kind === 'leads') return this.leads(createdAt);
    if (kind === 'bookings') return this.bookings(createdAt);
    if (kind === 'payments') return this.payments(createdAt);
    return this.listings();
  }

  private groupMap<T extends string>(rows: { _count: number }[], key: T): Record<string, number> {
    return Object.fromEntries(rows.map((r) => [(r as Record<string, unknown>)[key], r._count]));
  }

  private async leads(createdAt?: Prisma.DateTimeFilter): Promise<Report> {
    const where = createdAt ? { createdAt } : {};
    const [total, byStage, byType, bySource] = await Promise.all([
      this.prisma.scoped.lead.count({ where }),
      this.prisma.scoped.lead.groupBy({ by: ['stage'], where, _count: true }),
      this.prisma.scoped.lead.groupBy({ by: ['type'], where, _count: true }),
      this.prisma.scoped.lead.groupBy({ by: ['source'], where, _count: true }),
    ]);
    return {
      summary: { total, byStage: this.groupMap(byStage, 'stage'), byType: this.groupMap(byType, 'type'), bySource: this.groupMap(bySource, 'source') },
      rows: byStage.map((r) => ({ stage: r.stage, count: r._count })),
    };
  }

  private async bookings(createdAt?: Prisma.DateTimeFilter): Promise<Report> {
    const where = createdAt ? { createdAt } : {};
    const [total, byStatus, sums] = await Promise.all([
      this.prisma.scoped.booking.count({ where }),
      this.prisma.scoped.booking.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.scoped.booking.aggregate({ where, _sum: { amountDue: true, amountPaid: true } }),
    ]);
    return {
      summary: {
        total,
        byStatus: this.groupMap(byStatus, 'status'),
        totalDue: Number(sums._sum.amountDue ?? 0),
        totalPaid: Number(sums._sum.amountPaid ?? 0),
      },
      rows: byStatus.map((r) => ({ status: r.status, count: r._count })),
    };
  }

  private async payments(createdAt?: Prisma.DateTimeFilter): Promise<Report> {
    const where = { status: 'paid' as const, ...(createdAt ? { paidAt: createdAt } : {}) };
    const [count, byMethod, sum] = await Promise.all([
      this.prisma.scoped.payment.count({ where }),
      this.prisma.scoped.payment.groupBy({ by: ['method'], where, _count: true }),
      this.prisma.scoped.payment.aggregate({ where, _sum: { amount: true, refundedAmount: true } }),
    ]);
    return {
      summary: { paidCount: count, byMethod: this.groupMap(byMethod, 'method'), totalPaid: Number(sum._sum.amount ?? 0), totalRefunded: Number(sum._sum.refundedAmount ?? 0) },
      rows: byMethod.map((r) => ({ method: r.method, count: r._count })),
    };
  }

  private async listings(): Promise<Report> {
    const where = { deletedAt: null };
    const [total, byStatus, byType, byOffer] = await Promise.all([
      this.prisma.scoped.property.count({ where }),
      this.prisma.scoped.property.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.scoped.property.groupBy({ by: ['type'], where, _count: true }),
      this.prisma.scoped.property.groupBy({ by: ['offer'], where, _count: true }),
    ]);
    return {
      summary: { total, byStatus: this.groupMap(byStatus, 'status'), byType: this.groupMap(byType, 'type'), byOffer: this.groupMap(byOffer, 'offer') },
      rows: byType.map((r) => ({ type: r.type, count: r._count })),
    };
  }
}
