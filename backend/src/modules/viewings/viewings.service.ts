import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import type { AuthUser } from '../auth/auth-user.js';

const SLOT_LABEL: Record<number, string> = { 10: 'صباحاً', 14: 'بعد الظهر', 18: 'مساءً' };

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function slotLabel(d: Date): string {
  return SLOT_LABEL[d.getHours()] ?? `${String(d.getHours()).padStart(2, '0')}:00`;
}

@Injectable()
export class ViewingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly access: AccessScopeService,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
  ) {}

  adminList(query: { from?: string; to?: string; agentId?: string }, user: AuthUser) {
    const scope = this.access.forStaff(user).viewings;
    const where: Prisma.ViewingWhereInput = { ...scope };
    if (query.from || query.to) {
      where.scheduledAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.agentId) where.agentId = query.agentId;
    return this.prisma.scoped.viewing.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: { property: { select: { title: true, code: true } }, lead: { select: { name: true, phone: true } } },
    });
  }

  async confirm(id: string, user: AuthUser) {
    const v = await this.requireOwned(id);
    void user;
    const updated = await this.prisma.scoped.viewing.update({ where: { id }, data: { status: 'confirmed' } });
    const title = `تم تأكيد موعد معاينتك يوم ${fmtDate(v.scheduledAt)} ${slotLabel(v.scheduledAt)}`;
    if (v.customerId) {
      await this.notifications.notify({
        eventKey: 'viewing.confirmed',
        recipients: [{ type: 'customer', id: v.customerId }],
        title,
        body: '',
        link: '/account/viewings',
        data: { id },
        email: { subject: title, html: `<div dir="rtl">${title}</div>`, text: title },
      });
    } else if (v.lead?.email) {
      await this.integrations
        .sendEmail({ to: v.lead.email, subject: title, html: `<div dir="rtl">${title}</div>`, text: title, idempotencyKey: `viewing.confirmed:${id}` })
        .catch(() => undefined);
    }
    return updated;
  }

  async setStatus(id: string, status: 'completed' | 'no_show' | 'cancelled', notes: string | undefined, user: AuthUser) {
    await this.requireOwned(id);
    void user;
    return this.prisma.scoped.viewing.update({ where: { id }, data: { status, notes: notes ?? undefined } });
  }

  customerList(customerId: string) {
    return this.prisma.scoped.viewing.findMany({
      where: { customerId },
      orderBy: { scheduledAt: 'desc' },
      include: { property: { select: { id: true, title: true, code: true } } },
    });
  }

  private async requireOwned(id: string) {
    const v = await this.prisma.scoped.viewing.findFirst({ where: { id }, include: { lead: { select: { email: true } } } });
    if (!v) throw new NotFoundException('المعاينة غير موجودة');
    return v;
  }
}
