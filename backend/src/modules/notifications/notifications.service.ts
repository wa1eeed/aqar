import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { defaultChannels, isTransactional, DEFAULT_CHANNELS } from './events.js';

export type RecipientType = 'staff' | 'customer';

export interface Recipient {
  type: RecipientType;
  id: string;
}

export interface NotifyParams {
  eventKey: string;
  recipients: Recipient[];
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  email?: { subject: string; html: string; text: string };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly realtime: RealtimeGateway,
    private readonly integrations: IntegrationsService,
  ) {}

  /** يوزّع حدثاً على المستلمين: in-app (+ بثّ لحظي) و email حسب التفضيلات. */
  async notify(params: NotifyParams): Promise<void> {
    const tenantId = this.tenant.requireTenantId();
    for (const r of params.recipients) {
      const ch = await this.channels(tenantId, r, params.eventKey);
      if (ch.inApp) {
        const notif = await this.prisma.notification.create({
          data: {
            tenantId,
            recipientType: r.type,
            recipientId: r.id,
            eventKey: params.eventKey,
            title: params.title,
            body: params.body,
            link: params.link ?? null,
            data: (params.data ?? undefined) as object | undefined,
            priority: params.priority ?? 'normal',
          },
        });
        const unread = await this.prisma.notification.count({
          where: { tenantId, recipientType: r.type, recipientId: r.id, readAt: null, archivedAt: null },
        });
        this.emit(r, 'notification.new', notif);
        this.emit(r, 'notification.count', { unread });
      }
      if (ch.email && params.email) {
        const to = await this.recipientEmail(r);
        if (to) {
          try {
            await this.integrations.sendEmail({
              to,
              subject: params.email.subject,
              html: params.email.html,
              text: params.email.text,
              idempotencyKey: `${params.eventKey}:${params.data?.id ?? ''}:${r.id}`,
            });
          } catch (e) {
            this.logger.warn(`تعذّر إرسال بريد ${params.eventKey} إلى ${to}: ${String(e)}`);
          }
        }
      }
    }
  }

  /** بثّ إعلان من الإدارة إلى موظفين بأدوار محدّدة (notifications.broadcast). */
  async broadcast(roles: string[], title: string, body: string): Promise<{ sent: number }> {
    const tenantId = this.tenant.requireTenantId();
    const staff = await this.prisma.staffUser.findMany({
      where: { tenantId, isActive: true, deletedAt: null, ...(roles.length ? { role: { key: { in: roles } } } : {}) },
      select: { id: true },
    });
    await this.notify({
      eventKey: 'staff.broadcast',
      recipients: staff.map((s) => ({ type: 'staff' as const, id: s.id })),
      title,
      body,
    });
    return { sent: staff.length };
  }

  private emit(r: Recipient, event: string, data: unknown): void {
    if (r.type === 'staff') this.realtime.toStaffUser(r.id, event, data);
    else this.realtime.toCustomer(r.id, event, data);
  }

  private async channels(tenantId: string, r: Recipient, eventKey: string) {
    const def = defaultChannels(eventKey);
    if (isTransactional(eventKey)) return { inApp: true, email: true, sms: def.sms };
    const pref = await this.prisma.notificationPreference.findUnique({
      where: {
        tenantId_recipientType_recipientId_eventKey: {
          tenantId,
          recipientType: r.type,
          recipientId: r.id,
          eventKey,
        },
      },
    });
    return pref ? { inApp: pref.inApp, email: pref.email, sms: pref.sms } : def;
  }

  private async recipientEmail(r: Recipient): Promise<string | null> {
    if (r.type === 'staff') {
      const u = await this.prisma.staffUser.findUnique({ where: { id: r.id }, select: { email: true } });
      return u?.email ?? null;
    }
    const c = await this.prisma.customer.findUnique({ where: { id: r.id }, select: { email: true } });
    return c?.email ?? null;
  }

  // ───────── مركز الإشعارات ─────────
  async list(r: Recipient, opts: { unread?: boolean; page?: number; pageSize?: number }) {
    const tenantId = this.tenant.requireTenantId();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, opts.pageSize ?? 10);
    const where = {
      tenantId,
      recipientType: r.type,
      recipientId: r.id,
      archivedAt: null,
      ...(opts.unread ? { readAt: null } : {}),
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { tenantId, recipientType: r.type, recipientId: r.id, readAt: null, archivedAt: null } }),
    ]);
    return { items, total, unread, page, pageSize };
  }

  async markRead(r: Recipient, opts: { ids?: string[]; all?: boolean }) {
    const tenantId = this.tenant.requireTenantId();
    const where = opts.all
      ? { tenantId, recipientType: r.type, recipientId: r.id, readAt: null }
      : { tenantId, recipientType: r.type, recipientId: r.id, id: { in: opts.ids ?? [] } };
    await this.prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    const unread = await this.prisma.notification.count({
      where: { tenantId, recipientType: r.type, recipientId: r.id, readAt: null, archivedAt: null },
    });
    this.emit(r, 'notification.count', { unread });
    return { unread };
  }

  async getPreferences(r: Recipient) {
    const tenantId = this.tenant.requireTenantId();
    const stored = await this.prisma.notificationPreference.findMany({
      where: { tenantId, recipientType: r.type, recipientId: r.id },
    });
    const byKey = new Map(stored.map((p) => [p.eventKey, p]));
    return Object.keys(DEFAULT_CHANNELS).map((eventKey) => {
      const p = byKey.get(eventKey);
      const def = defaultChannels(eventKey);
      return {
        eventKey,
        locked: isTransactional(eventKey),
        inApp: p ? p.inApp : def.inApp,
        email: p ? p.email : def.email,
        sms: p ? p.sms : def.sms,
      };
    });
  }

  async setPreference(r: Recipient, eventKey: string, ch: { inApp: boolean; email: boolean; sms: boolean }) {
    const tenantId = this.tenant.requireTenantId();
    // الأحداث المعاملاتية تبقى مفعّلة
    const value = isTransactional(eventKey) ? { inApp: true, email: true, sms: ch.sms } : ch;
    return this.prisma.notificationPreference.upsert({
      where: {
        tenantId_recipientType_recipientId_eventKey: { tenantId, recipientType: r.type, recipientId: r.id, eventKey },
      },
      create: { tenantId, recipientType: r.type, recipientId: r.id, eventKey, ...value },
      update: value,
    });
  }
}
