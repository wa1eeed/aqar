import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from './notifications.service';

const DAY = 86_400_000;
/** Reminder thresholds in days (docs/07 §10.2). */
export const LICENSE_THRESHOLDS = [60, 30, 7] as const;

/** The tightest threshold already reached (e.g. 20 days left → 30), or null. */
export function thresholdFor(daysLeft: number): number | null {
  const hits = LICENSE_THRESHOLDS.filter((t) => daysLeft <= t);
  return hits.length ? Math.min(...hits) : null;
}

/**
 * Licence expiry reminders (`license.expiring`, daily in the worker): the company's FAL licence
 * (settings «التراخيص») and the advertising licences of published listings. One notification per
 * licence and threshold (Redis NX), so reruns and restarts never repeat a reminder.
 */
@Injectable()
export class LicenseReminders {
  private readonly logger = new Logger(LicenseReminders.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private daysLeft(expiry: Date, now: Date) {
    return Math.ceil((expiry.getTime() - now.getTime()) / DAY);
  }
  private async once(key: string): Promise<boolean> {
    return (await this.redis.set(`lic:remind:${key}`, '1', 'EX', 400 * 86_400, 'NX')) === 'OK';
  }
  private adminUrl(path: string) {
    return `${this.env.PUBLIC_URL}/admin${path}`;
  }

  async run(now = new Date()): Promise<number> {
    let sent = 0;
    const lic = await this.settings.get('licensing');
    if (lic.regaFalExpiry) {
      const expiry = new Date(`${lic.regaFalExpiry}T00:00:00+03:00`);
      const left = this.daysLeft(expiry, now);
      const t = thresholdFor(left);
      if (t !== null && (await this.once(`company:${lic.regaFalExpiry}:${t}`))) {
        const title = left > 0 ? `رخصة فال للمنشأة تنتهي خلال ${left} يوماً` : 'انتهت رخصة فال للمنشأة';
        await this.notifications.dispatch(
          'license.expiring',
          await this.notifications.staffWith('settings.licensing', { roleKeys: ['owner', 'admin'] }),
          {
            title,
            body: `تاريخ الانتهاء ${lic.regaFalExpiry} — جدّد الرخصة وحدّث رقمها في الإعدادات.`,
            link: '/admin/settings/licensing',
            priority: left <= 7 ? 'high' : 'normal',
          },
          {
            entityId: `company:${lic.regaFalExpiry}:${t}`,
            email: {
              template: 'license-expiring',
              content: {
                subject: title,
                title,
                intro: 'تنبيه تجديد الترخيص لدى الهيئة العامة للعقار.',
                cta: { label: 'إعدادات التراخيص', url: this.adminUrl('/settings/licensing') },
              },
            },
          },
        );
        sent++;
      }
    }

    const listings = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        visibility: 'published',
        licenseExpiry: { not: null, lte: new Date(now.getTime() + 60 * DAY) },
      },
      select: { id: true, code: true, title: true, licenseExpiry: true, agentId: true },
      take: 500,
    });
    const managers = listings.length ? await this.notifications.staffWith('properties.edit', { scopeAll: true }) : [];
    for (const p of listings) {
      const left = this.daysLeft(p.licenseExpiry!, now);
      const t = thresholdFor(left);
      const day = p.licenseExpiry!.toISOString().slice(0, 10);
      if (t === null || !(await this.once(`property:${p.id}:${day}:${t}`))) continue;
      const title = left > 0 ? `ترخيص إعلان ${p.code} ينتهي خلال ${left} يوماً` : `انتهى ترخيص إعلان ${p.code}`;
      const recipients = [...(p.agentId ? [{ type: 'staff' as const, id: p.agentId }] : []), ...managers].filter(
        (r, i, a) => a.findIndex((x) => x.id === r.id) === i,
      );
      await this.notifications.dispatch(
        'license.expiring',
        recipients,
        {
          title,
          body: `${p.title} — جدّد ترخيص الإعلان قبل ${day}.`,
          link: `/admin/properties/${p.id}`,
          priority: left <= 7 ? 'high' : 'normal',
        },
        { entityId: `property:${p.id}:${day}:${t}` },
      );
      sent++;
    }
    if (sent) this.logger.log(`license reminders sent: ${sent}`);
    return sent;
  }
}
