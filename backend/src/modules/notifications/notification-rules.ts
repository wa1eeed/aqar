import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { leadStages, leadTypes, statuses, type LeadStage, type LeadType } from '@nx/schema';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService, rooms } from '../realtime/realtime.service';
import { dayLabel, sarLabel, slotLabel, timeLabel } from './format';
import { NotificationsService, type Recipient } from './notifications.service';

const staff = (id: string): Recipient => ({ type: 'staff', id });
const customer = (id: string): Recipient => ({ type: 'customer', id });

export interface LeadEvent {
  id: string;
  number: string;
  assignedToId: string | null;
  actorId?: string | null;
  stage?: string;
}

/**
 * Who is notified of what (docs/06 §3). Listeners run after the business transaction has committed
 * (events are emitted after `$transaction`), and never throw back into the request.
 */
@Injectable()
export class NotificationRules {
  private readonly logger = new Logger(NotificationRules.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async safe(event: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.error({ err: e, event }, 'notification rule failed');
    }
  }

  private adminUrl(path: string): string {
    return `${this.env.PUBLIC_URL}/admin${path}`;
  }

  // ───────────── leads ─────────────

  @OnEvent('lead.created', { async: true })
  onLeadCreated(e: LeadEvent): Promise<void> {
    return this.safe('lead.created', async () => {
      const lead = await this.prisma.lead.findUnique({
        where: { id: e.id },
        include: { property: { select: { title: true, code: true, agentId: true } } },
      });
      if (!lead) return;
      const typeLabel = leadTypes[lead.type as LeadType];
      const title = lead.property ? `طلب جديد: ${typeLabel} — ${lead.property.title}` : `طلب جديد: ${typeLabel}`;
      const managers = await this.notifications.staffWith('leads.view', { roleKeys: ['sales_manager'] });
      // Nobody assigned (manager-only routing): everyone who can assign gets it.
      const fallback = lead.assignedToId ? [] : await this.notifications.staffWith('leads.assign', { scopeAll: true });
      // A viewing request also raises `viewing.requested` for the listing's agent: no double message.
      const viewingAgent = lead.type === 'viewing' ? lead.property?.agentId : null;
      const recipients = [...(lead.assignedToId ? [staff(lead.assignedToId)] : []), ...managers, ...fallback].filter(
        (r) => r.id !== viewingAgent,
      );
      const link = `/admin/leads?open=${lead.id}`;
      await this.notifications.dispatch(
        'lead.created',
        recipients,
        { title, body: `${lead.number} · ${lead.name}`, link, data: { leadId: lead.id } },
        {
          entityId: lead.id,
          email: {
            template: 'lead-new-staff',
            content: {
              subject: title,
              title,
              intro: 'وصل طلب جديد من الموقع. تواصل مع العميل في أقرب وقت.',
              details: [
                ['رقم الطلب', lead.number],
                ['النوع', typeLabel],
                ['العقار', lead.property ? `${lead.property.title} (${lead.property.code})` : ''],
                ['العميل', lead.name],
              ],
              cta: { label: 'فتح الطلب', url: this.adminUrl(`/leads?open=${lead.id}`) },
            },
          },
        },
      );
      await this.pushLead('lead.created', lead);
    });
  }

  @OnEvent('lead.assigned', { async: true })
  onLeadAssigned(e: LeadEvent): Promise<void> {
    return this.safe('lead.assigned', async () => {
      const lead = await this.prisma.lead.findUnique({
        where: { id: e.id },
        include: { property: { select: { title: true } } },
      });
      if (!lead) return;
      if (lead.assignedToId && lead.assignedToId !== e.actorId) {
        const title = `أُسند إليك طلب ${lead.number}`;
        await this.notifications.dispatch(
          'lead.assigned',
          [staff(lead.assignedToId)],
          { title, body: `${leadTypes[lead.type as LeadType]} · ${lead.name}`, link: `/admin/leads?open=${lead.id}` },
          {
            entityId: `${lead.id}:${lead.assignedToId}`,
            email: {
              template: 'lead-assigned',
              content: {
                subject: title,
                title,
                intro: 'أصبحت مسؤولاً عن هذا الطلب.',
                details: [
                  ['النوع', leadTypes[lead.type as LeadType]],
                  ['العقار', lead.property?.title ?? ''],
                  ['العميل', lead.name],
                ],
                cta: { label: 'فتح الطلب', url: this.adminUrl(`/leads?open=${lead.id}`) },
              },
            },
          },
        );
      }
      await this.pushLead('lead.updated', lead);
    });
  }

  @OnEvent('lead.stage_changed', { async: true })
  onLeadStage(e: LeadEvent): Promise<void> {
    return this.safe('lead.stage_changed', async () => {
      const lead = await this.prisma.lead.findUnique({ where: { id: e.id } });
      if (!lead) return;
      if (lead.assignedToId && lead.assignedToId !== e.actorId) {
        await this.notifications.dispatch(
          'lead.stage_changed',
          [staff(lead.assignedToId)],
          {
            title: `تغيّرت حالة الطلب ${lead.number} إلى ${leadStages[lead.stage as LeadStage].label}`,
            body: lead.name,
            link: `/admin/leads?open=${lead.id}`,
          },
          { entityId: `${lead.id}:${lead.stage}` },
        );
      }
      await this.pushLead('lead.updated', lead);
    });
  }

  /** `lead.created` / `lead.updated` to managers' role rooms and the assignee (docs/02 §9). */
  private async pushLead(
    event: string,
    lead: { id: string; number: string; stage: string; assignedToId: string | null },
  ): Promise<void> {
    const targets = await this.notifications.roleRoomsWith('leads.view');
    if (lead.assignedToId) targets.push(rooms.staffUser(lead.assignedToId));
    this.realtime.emit(targets, event, {
      id: lead.id,
      number: lead.number,
      stage: lead.stage,
      assignedToId: lead.assignedToId,
    });
  }

  // ───────────── viewings ─────────────

  @OnEvent('viewing.requested', { async: true })
  onViewingRequested(e: { leadId: string; propertyId?: number }): Promise<void> {
    return this.safe('viewing.requested', async () => {
      const lead = await this.prisma.lead.findUnique({
        where: { id: e.leadId },
        include: {
          property: { select: { id: true, title: true, code: true, agentId: true } },
          viewings: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!lead?.property) return;
      const viewing = lead.viewings[0];
      const when = viewing?.scheduledAt ?? lead.preferredDate;
      const date = when ? dayLabel(when) : 'غير محدد';
      const agentId = viewing?.agentId ?? lead.property.agentId;
      const title = `طلب معاينة: ${lead.property.title} يوم ${date}`;
      const slot = viewing ? slotLabel(viewing.scheduledAt) : '';
      await this.notifications.dispatch(
        'viewing.requested',
        [staff(agentId)],
        {
          title,
          body: `${lead.name} · ${lead.number}${slot ? ` · ${slot}` : ''}`,
          link: `/admin/leads?open=${lead.id}`,
          priority: 'high',
          data: { leadId: lead.id, viewingId: viewing?.id ?? null },
        },
        {
          entityId: lead.id,
          email: {
            template: 'lead-new-staff',
            content: {
              subject: title,
              title,
              intro: 'طلب عميل معاينة أحد عقاراتك. أكّد الموعد مع العميل من لوحة التحكم.',
              details: [
                ['العقار', `${lead.property.title} (${lead.property.code})`],
                ['الموعد المفضل', `${date}${slot ? ` · ${slot}` : ''}`],
                ['العميل', lead.name],
                ['رقم الطلب', lead.number],
              ],
              cta: { label: 'فتح الطلب', url: this.adminUrl(`/leads?open=${lead.id}`) },
            },
          },
        },
      );
    });
  }

  @OnEvent('viewing.confirmed', { async: true })
  onViewingConfirmed(e: { viewingId: string }): Promise<void> {
    return this.safe('viewing.confirmed', async () => {
      const v = await this.prisma.viewing.findUnique({
        where: { id: e.viewingId },
        include: {
          property: { select: { id: true, title: true, slug: true } },
          lead: { select: { email: true, name: true } },
          agent: { select: { name: true, phone: true } },
        },
      });
      if (!v) return;
      const date = dayLabel(v.scheduledAt);
      const slot = slotLabel(v.scheduledAt);
      const title = `تم تأكيد موعد معاينتك يوم ${date} ${slot}`;
      const email = {
        template: 'viewing-confirmed' as const,
        content: {
          subject: title,
          title,
          intro: `نتطلع لرؤيتك. سيرافقك ${v.agent.name} في المعاينة.`,
          details: [
            ['العقار', v.property.title],
            ['الموعد', `${date} · ${timeLabel(v.scheduledAt)}`],
            ['المستشار', v.agent.name],
            ['جوال المستشار', v.agent.phone ?? ''],
          ] as Array<[string, string]>,
          cta: { label: 'عرض العقار', url: `${this.env.PUBLIC_URL}/property/${v.property.id}-${v.property.slug}` },
        },
      };
      const entityId = `${v.id}:${v.scheduledAt.toISOString()}`;
      if (v.customerId) {
        await this.notifications.dispatch(
          'viewing.confirmed',
          [customer(v.customerId)],
          { title, body: v.property.title, link: '/account/viewings', data: { viewingId: v.id } },
          { entityId, email },
        );
      } else if (v.lead?.email) {
        await this.notifications.emailGuest('viewing.confirmed', entityId, v.lead.email, email);
      }
    });
  }

  // ───────────── properties ─────────────

  @OnEvent('property.status_changed', { async: true })
  onPropertyStatus(e: { propertyId: number; from: string; to: string; agentId: string; actorId?: string }) {
    return this.safe('property.status_changed', async () => {
      const p = await this.prisma.property.findUnique({
        where: { id: e.propertyId },
        select: { id: true, title: true, slug: true, visibility: true, price: true, status: true },
      });
      if (!p) return;
      const label = statuses[e.to as keyof typeof statuses]?.label ?? e.to;
      const title = `${p.title}: ${label}`;
      if (e.actorId !== e.agentId) {
        await this.notifications.dispatch(
          'property.status_changed',
          [staff(e.agentId)],
          {
            title,
            body: `من «${statuses[e.from as keyof typeof statuses]?.label ?? e.from}»`,
            link: `/admin/properties/${p.id}`,
          },
          { entityId: `${p.id}:${e.to}` },
        );
      }
      // Customers only hear about a listing becoming available again (docs/06 §3).
      if (e.to === 'available' && p.visibility === 'published') {
        await this.notifications.dispatch(
          'property.status_changed',
          await this.favoritedBy(p.id),
          { title, body: 'أصبح العقار متاحاً من جديد', link: `/property/${p.id}-${p.slug}` },
          { entityId: `${p.id}:${e.to}` },
        );
      }
      this.pushProperty(p);
    });
  }

  @OnEvent('property.price_dropped', { async: true })
  onPriceDropped(e: { propertyId: number; from: number; to: number }) {
    return this.safe('property.price_dropped', async () => {
      const p = await this.prisma.property.findUnique({
        where: { id: e.propertyId },
        select: { id: true, title: true, slug: true, visibility: true, price: true, status: true },
      });
      if (!p || p.visibility !== 'published') return;
      const title = `انخفض سعر ${p.title}`;
      const url = `/property/${p.id}-${p.slug}`;
      await this.notifications.dispatch(
        'property.price_dropped',
        await this.favoritedBy(p.id),
        { title, body: `${sarLabel(e.from)} ← ${sarLabel(e.to)}`, link: url },
        {
          entityId: `${p.id}:${e.to}`,
          email: {
            template: 'price-drop',
            content: {
              subject: title,
              title,
              intro: 'انخفض سعر عقار في قائمة مفضلتك.',
              details: [
                ['السعر السابق', sarLabel(e.from)],
                ['السعر الجديد', sarLabel(e.to)],
              ],
              cta: { label: 'عرض العقار', url: `${this.env.PUBLIC_URL}${url}` },
            },
          },
        },
      );
    });
  }

  /** Live status/price on the public pages (docs/08 §7.5). */
  @OnEvent('property.changed')
  onPropertyChanged(e: { id: number }) {
    return this.safe('property.changed', async () => {
      const p = await this.prisma.property.findUnique({
        where: { id: e.id },
        select: { id: true, visibility: true, price: true, status: true },
      });
      if (p) this.pushProperty(p);
    });
  }

  @OnEvent('property.published')
  onPublished(e: { id: number }) {
    this.realtime.emit(rooms.public, 'property.published', { id: e.id });
  }

  @OnEvent('property.unpublished')
  onUnpublished(e: { id: number }) {
    this.realtime.emit([rooms.public, rooms.property(e.id)], 'property.unpublished', { id: e.id });
  }

  private pushProperty(p: { id: number; status: string; price: bigint; visibility: string }): void {
    if (p.visibility !== 'published') return;
    this.realtime.emit([rooms.property(p.id), rooms.public], 'property.updated', {
      id: p.id,
      status: p.status,
      price: Number(p.price) / 100,
      visibility: p.visibility,
    });
  }

  private async favoritedBy(propertyId: number): Promise<Recipient[]> {
    const rows = await this.prisma.favorite.findMany({ where: { propertyId }, select: { customerId: true } });
    return rows.map((r) => customer(r.customerId));
  }

  // ───────────── system ─────────────

  @OnEvent('integration.health_changed', { async: true })
  onIntegrationHealth(e: { key: string; from: string; to: string }) {
    return this.safe('integration.health_changed', async () => {
      const row = await this.prisma.integration.findUnique({ where: { key: e.key }, select: { key: true } });
      if (!row) return;
      const HEALTH: Record<string, string> = { ok: 'تعمل', degraded: 'متقطعة', down: 'متوقفة', unknown: 'غير معروفة' };
      const title = `تغيّرت حالة التكامل ${e.key}: ${HEALTH[e.to] ?? e.to}`;
      await this.notifications.dispatch(
        'integration.health_changed',
        await this.notifications.staffWith('integrations.manage'),
        {
          title,
          body: `الحالة السابقة: ${HEALTH[e.from] ?? e.from}`,
          link: `/admin/integrations/${e.key}`,
          priority: e.to === 'down' ? 'high' : 'normal',
        },
        {
          entityId: `${e.key}:${e.to}:${new Date().toISOString().slice(0, 13)}`,
          // Email only when an integration goes down (docs/06 §3).
          ...(e.to === 'down'
            ? {
                email: {
                  template: 'integration-down' as const,
                  content: {
                    subject: title,
                    title,
                    intro: 'توقف أحد التكاملات عن العمل. راجع الإعدادات وسجل الاتصالات.',
                    cta: { label: 'فتح التكامل', url: this.adminUrl(`/integrations/${e.key}`) },
                  },
                },
              }
            : {}),
        },
      );
    });
  }

  @OnEvent('email.bounced', { async: true })
  onBounced(e: { email?: string }) {
    return this.safe('email.bounced', async () => {
      if (!e.email) return;
      await this.notifications.dispatch(
        'email.bounced',
        await this.notifications.staffWith('staff.manage', { roleKeys: ['owner', 'admin'] }),
        { title: `تعذّر تسليم بريد إلى ${e.email}`, body: 'تحقق من صحة العنوان.', link: '/admin/notifications' },
        { entityId: e.email },
      );
    });
  }

  @OnEvent('security.new_login', { async: true })
  onNewLogin(e: { recipientType: 'staff' | 'customer'; recipientId: string; ip?: string; userAgent?: string }) {
    return this.safe('security.new_login', async () => {
      const at = new Date();
      const device = (e.userAgent ?? '').slice(0, 120) || 'جهاز غير معروف';
      const title = 'تسجيل دخول جديد إلى حسابك';
      await this.notifications.dispatch(
        'security.new_login',
        [{ type: e.recipientType, id: e.recipientId }],
        { title, body: device, link: e.recipientType === 'staff' ? '/admin' : '/account/settings#security' },
        {
          entityId: `${e.recipientId}:${at.getTime()}`,
          email: {
            template: 'security-new-login',
            content: {
              subject: title,
              title,
              intro: 'تم تسجيل الدخول إلى حسابك. إن لم تكن أنت فغيّر كلمة المرور فوراً وتواصل معنا.',
              details: [
                ['الوقت', `${dayLabel(at)} · ${timeLabel(at)}`],
                ['الجهاز', device],
                ['عنوان IP', e.ip ?? ''],
              ],
            },
          },
        },
      );
    });
  }

  @OnEvent('security.session_revoked', { async: true })
  onSessionRevoked(e: { recipientType: 'staff' | 'customer'; recipientId: string }) {
    return this.safe('security.session_revoked', async () => {
      const title = 'أُنهيت جلسات حسابك لأسباب أمنية';
      await this.notifications.dispatch(
        'security.session_revoked',
        [{ type: e.recipientType, id: e.recipientId }],
        { title, body: 'سجّل الدخول من جديد.', priority: 'high' },
        {
          entityId: `${e.recipientId}:${Date.now()}`,
          email: {
            template: 'security-new-login',
            content: {
              subject: title,
              title,
              intro:
                'رصدنا استخدام رمز دخول قديم، فأنهينا جميع جلسات حسابك احتياطاً. إن لم تكن أنت فغيّر كلمة المرور فوراً.',
            },
          },
        },
      );
    });
  }
}
