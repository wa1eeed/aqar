import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { buildWhere, listQuerySchema } from '../properties/query';
import { dayLabel, sarLabel, timeLabel } from './format';
import { NotificationsService } from './notifications.service';

const H = 3600_000;

/**
 * Scheduled CRM notifications (worker): viewing reminders 24 h and 2 h before (docs/06
 * viewing.reminder) and the daily saved-search digest (property.matched_saved_search).
 * Each reminder is sent once per viewing, kind and time (Redis NX), so overlapping runs are safe.
 */
@Injectable()
export class CrmJobsService {
  private readonly logger = new Logger(CrmJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async viewingReminders(now = new Date()): Promise<number> {
    let sent = 0;
    for (const kind of ['24h', '2h'] as const) {
      const [from, to] = kind === '24h' ? [20 * H, 24 * H] : [0, 2 * H];
      const due = await this.prisma.viewing.findMany({
        where: {
          status: 'confirmed',
          scheduledAt: { gt: new Date(now.getTime() + from), lte: new Date(now.getTime() + to) },
        },
        include: {
          property: { select: { id: true, title: true, slug: true } },
          lead: { select: { email: true } },
          agent: { select: { name: true, phone: true } },
        },
        take: 500,
      });
      for (const v of due) {
        const once = `remind:viewing:${v.id}:${kind}:${v.scheduledAt.getTime()}`;
        if ((await this.redis.set(once, '1', 'EX', 3 * 86_400, 'NX')) !== 'OK') continue;
        const title = `تذكير: موعد معاينة ${v.property.title}`;
        const when = `${dayLabel(v.scheduledAt)} · ${timeLabel(v.scheduledAt)}`;
        const email =
          kind === '24h'
            ? {
                template: 'viewing-reminder' as const,
                content: {
                  subject: title,
                  title,
                  intro: 'نذكّرك بموعد المعاينة غداً.',
                  details: [
                    ['الموعد', when],
                    ['المستشار', v.agent.name],
                    ['جوال المستشار', v.agent.phone ?? ''],
                  ] as Array<[string, string]>,
                  cta: {
                    label: 'عرض العقار',
                    url: `${this.env.PUBLIC_URL}/property/${v.property.id}-${v.property.slug}`,
                  },
                },
              }
            : undefined;
        const entityId = `${v.id}:${kind}:${v.scheduledAt.getTime()}`;
        await this.notifications.dispatch(
          'viewing.reminder',
          [{ type: 'staff', id: v.agentId }],
          { title, body: when, link: '/admin/viewings' },
          { entityId },
        );
        if (v.customerId) {
          await this.notifications.dispatch(
            'viewing.reminder',
            [{ type: 'customer', id: v.customerId }],
            { title, body: when, link: '/account/viewings' },
            { entityId, ...(email ? { email } : {}) },
          );
        } else if (email && v.lead?.email) {
          await this.notifications.emailGuest('viewing.reminder', entityId, v.lead.email, email);
        }
        sent++;
      }
    }
    return sent;
  }

  async savedSearchDigest(now = new Date()): Promise<number> {
    const searches = await this.prisma.savedSearch.findMany({
      where: { alertEnabled: true, customer: { status: 'active', deletedAt: null } },
      take: 5000,
    });
    let notified = 0;
    for (const s of searches) {
      const parsed = listQuerySchema.safeParse(s.query ?? {});
      if (!parsed.success) continue;
      const since = s.lastNotifiedAt ?? s.createdAt;
      const where = await buildWhere(this.prisma, parsed.data, [
        { visibility: 'published' },
        { publishedAt: { gt: since, lte: now } },
      ]);
      const [count, top] = await Promise.all([
        this.prisma.property.count({ where }),
        this.prisma.property.findMany({
          where,
          orderBy: { publishedAt: 'desc' },
          take: 5,
          select: { id: true, title: true, price: true, slug: true },
        }),
      ]);
      await this.prisma.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: now } });
      if (!count) continue;
      const title = `عقارات جديدة تطابق بحثك «${s.name}»`;
      const qs = new URLSearchParams(s.query as Record<string, string>).toString();
      await this.notifications.dispatch(
        'property.matched_saved_search',
        [{ type: 'customer', id: s.customerId }],
        { title, body: `${count} عقار جديد`, link: `/properties${qs ? `?${qs}` : ''}`, data: { savedSearchId: s.id } },
        {
          entityId: `${s.id}:${now.toISOString().slice(0, 10)}`,
          email: {
            template: 'saved-search-digest',
            content: {
              subject: title,
              title,
              intro: `أُضيف ${count} عقار جديد يطابق بحثك المحفوظ.`,
              details: top.map((p) => [p.title, sarLabel(p.price)] as [string, string]),
              cta: { label: 'عرض النتائج', url: `${this.env.PUBLIC_URL}/properties${qs ? `?${qs}` : ''}` },
            },
          },
        },
      );
      notified++;
    }
    this.logger.log(`saved-search digest: ${notified} customers notified`);
    return notified;
  }
}
