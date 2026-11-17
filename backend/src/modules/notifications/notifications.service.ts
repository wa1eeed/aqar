import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationPriority, Prisma, SubjectType } from '@prisma/client';
import type Redis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import type { AuthUser } from '../auth/auth.types';
import { StaffAuthService } from '../auth/staff-auth.service';
import { EmailService, type EmailTemplateKey } from '../email/email.service';
import type { NotificationEmail } from '../email/templates';
import { EVENT_CATALOG, type EventDef } from '../events/event-catalog';
import { RealtimeService, rooms } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';

export interface Recipient {
  type: SubjectType;
  id: string;
}

export interface NotificationContent {
  title: string;
  body: string;
  /** Relative link inside the admin (`/admin/…`) or the site (`/account/…`). */
  link?: string | null;
  priority?: NotificationPriority;
  data?: Record<string, unknown>;
}

export interface DispatchOptions {
  /** Entity the event is about: part of the email idempotency key (docs/06 §1). */
  entityId: string;
  email?: { template: EmailTemplateKey; content: NotificationEmail };
  /** Send the email to this address when the recipient has no account (e.g. a guest's lead). */
}

export type Channels = { inApp: boolean; email: boolean; sms: boolean };

/** Admin notification-center tabs (docs/06 §2). */
export const TAB_PREFIXES: Record<string, string[]> = {
  leads: ['lead.', 'viewing.'],
  bookings: ['booking.'],
  payments: ['payment.'],
  system: ['integration.', 'email.', 'license.', 'security.', 'staff.', 'property.'],
};

const CATALOG = new Map<string, EventDef>(EVENT_CATALOG.map((e) => [e.key, e]));
const EMAIL_DEDUPE_SEC = 24 * 3600;
const MAX_TEXT = 500;

/**
 * Notification pipeline (docs/06 §1): resolve channels from the admin defaults and the recipient's
 * preferences, write in-app notifications and push them over Socket.IO, queue emails (deduplicated
 * per event + entity + recipient). SMS channels are recorded in preferences but nothing is sent
 * until an SMS integration exists (docs/05).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
    private readonly realtime: RealtimeService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Effective channels: admin defaults (settings) overridden by the recipient's preference. */
  async channelsFor(eventKey: string, recipients: Recipient[]): Promise<Map<string, Channels>> {
    const defaults = (await this.settings.get('notifications')).channels[eventKey] ??
      CATALOG.get(eventKey)?.defaults ?? { inApp: true, email: false, sms: false };
    const prefs = recipients.length
      ? await this.prisma.notificationPreference.findMany({
          where: { eventKey, OR: recipients.map((r) => ({ recipientType: r.type, recipientId: r.id })) },
        })
      : [];
    const locked = !!CATALOG.get(eventKey)?.locked;
    const out = new Map<string, Channels>();
    for (const r of recipients) {
      const p = prefs.find((x) => x.recipientType === r.type && x.recipientId === r.id);
      // Locked events (payments, bookings, security): a preference can add channels, never remove them.
      const ch = p
        ? locked
          ? { inApp: defaults.inApp || p.inApp, email: defaults.email || p.email, sms: defaults.sms || p.sms }
          : { inApp: p.inApp, email: p.email, sms: p.sms }
        : { ...defaults };
      out.set(`${r.type}:${r.id}`, ch);
    }
    return out;
  }

  async dispatch(
    eventKey: string,
    recipients: Recipient[],
    content: NotificationContent,
    opts: DispatchOptions,
  ): Promise<void> {
    const unique = [...new Map(recipients.map((r) => [`${r.type}:${r.id}`, r])).values()];
    if (!unique.length) return;
    const [channels, contacts] = await Promise.all([this.channelsFor(eventKey, unique), this.contacts(unique)]);
    for (const r of unique) {
      const key = `${r.type}:${r.id}`;
      const contact = contacts.get(key);
      if (!contact) continue; // inactive, blocked or deleted
      const ch = channels.get(key)!;
      try {
        if (ch.inApp) await this.createInApp(eventKey, r, content);
        if (ch.email && opts.email && contact.email) {
          await this.sendEmailOnce(eventKey, opts.entityId, key, contact.email, opts.email, r.type);
        }
      } catch (e) {
        // One recipient's failure must not block the others (and never the business action).
        this.logger.error({ err: e, eventKey, recipient: key }, 'notification dispatch failed');
      }
    }
  }

  /** Email to an address without an account (guest leads): same dedupe, no in-app. */
  async emailGuest(
    eventKey: string,
    entityId: string,
    address: string,
    email: { template: EmailTemplateKey; content: NotificationEmail },
  ): Promise<void> {
    await this.sendEmailOnce(eventKey, entityId, `guest:${address}`, address, email, null);
  }

  private async sendEmailOnce(
    eventKey: string,
    entityId: string,
    recipientKey: string,
    address: string,
    email: { template: EmailTemplateKey; content: NotificationEmail },
    type: SubjectType | null,
  ): Promise<void> {
    const dedupe = `notif:email:${eventKey}:${entityId}:${recipientKey}`;
    if ((await this.redis.set(dedupe, '1', 'EX', EMAIL_DEDUPE_SEC, 'NX')) !== 'OK') return;
    const locked = !!CATALOG.get(eventKey)?.locked;
    const manageUrl =
      locked || type === null
        ? undefined
        : type === 'customer'
          ? `${this.env.PUBLIC_URL}/account/settings#notifications`
          : `${this.env.PUBLIC_URL}/admin/notifications`;
    await this.email.sendNotification(
      email.template,
      address,
      email.content,
      { type: eventKey, id: entityId },
      {
        ...(manageUrl ? { manageUrl } : {}),
      },
    );
  }

  private async createInApp(eventKey: string, r: Recipient, c: NotificationContent): Promise<void> {
    const n = await this.prisma.notification.create({
      data: {
        recipientType: r.type,
        recipientId: r.id,
        eventKey,
        title: c.title.slice(0, 200),
        body: c.body.slice(0, MAX_TEXT),
        link: c.link ?? null,
        priority: c.priority ?? 'normal',
        ...(c.data ? { data: c.data as Prisma.InputJsonValue } : {}),
      },
    });
    const room = r.type === 'customer' ? rooms.customer(r.id) : rooms.staffUser(r.id);
    this.realtime.emit(room, 'notification.new', {
      id: n.id,
      eventKey,
      title: n.title,
      body: n.body,
      link: n.link,
      priority: n.priority,
      createdAt: n.createdAt.toISOString(),
    });
    this.realtime.emit(room, 'notification.count', { unread: await this.unreadCount(r) });
  }

  /** Active recipients and their email addresses. */
  private async contacts(recipients: Recipient[]): Promise<Map<string, { email: string | null }>> {
    const staffIds = recipients.filter((r) => r.type === 'staff').map((r) => r.id);
    const customerIds = recipients.filter((r) => r.type === 'customer').map((r) => r.id);
    const [staff, customers] = await Promise.all([
      staffIds.length
        ? this.prisma.staffUser.findMany({
            where: { id: { in: staffIds }, isActive: true, deletedAt: null },
            select: { id: true, email: true },
          })
        : [],
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds }, status: 'active', deletedAt: null },
            select: { id: true, email: true },
          })
        : [],
    ]);
    const out = new Map<string, { email: string | null }>();
    for (const s of staff) out.set(`staff:${s.id}`, { email: s.email });
    for (const c of customers) out.set(`customer:${c.id}`, { email: c.email });
    return out;
  }

  // ───────────── recipient helpers ─────────────

  /** Active staff holding `perm`; `scopeAll` excludes "own"-scoped roles (agents). */
  async staffWith(perm: string, opts: { scopeAll?: boolean; roleKeys?: string[] } = {}): Promise<Recipient[]> {
    const users = await this.prisma.staffUser.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { permissions: { has: perm }, ...(opts.roleKeys ? { key: { in: opts.roleKeys } } : {}) },
      },
      select: { id: true, role: { select: { key: true } } },
    });
    return users
      .filter((u) => !opts.scopeAll || StaffAuthService.scopeFor(u.role.key) === 'all')
      .map((u) => ({ type: 'staff' as const, id: u.id }));
  }

  /** Role rooms whose members hold `perm` with an unrestricted scope (for `lead.*` socket events). */
  async roleRoomsWith(perm: string): Promise<string[]> {
    const roles = await this.prisma.role.findMany({ where: { permissions: { has: perm } }, select: { key: true } });
    return roles.filter((r) => StaffAuthService.scopeFor(r.key) === 'all').map((r) => rooms.role(r.key));
  }

  // ───────────── centers (admin + customer) ─────────────

  private owner(user: AuthUser): Prisma.NotificationWhereInput {
    return { recipientType: user.typ, recipientId: user.id };
  }

  async unreadCount(r: Recipient): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientType: r.type, recipientId: r.id, readAt: null, archivedAt: null },
    });
  }

  async list(
    user: AuthUser,
    q: { unread?: boolean; tab?: string; page: number; pageSize: number; archived?: boolean },
  ) {
    const prefixes = q.tab ? TAB_PREFIXES[q.tab] : undefined;
    const where: Prisma.NotificationWhereInput = {
      ...this.owner(user),
      archivedAt: q.archived ? { not: null } : null,
      ...(q.unread ? { readAt: null } : {}),
      ...(prefixes ? { OR: prefixes.map((p) => ({ eventKey: { startsWith: p } })) } : {}),
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          eventKey: true,
          title: true,
          body: true,
          link: true,
          priority: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where }),
      this.unreadCount({ type: user.typ, id: user.id }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.ceil(total / q.pageSize), unread };
  }

  async markRead(user: AuthUser, body: { ids?: string[]; all?: boolean }): Promise<{ unread: number }> {
    await this.prisma.notification.updateMany({
      where: { ...this.owner(user), readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
      data: { readAt: new Date() },
    });
    return this.pushCount(user);
  }

  async archive(user: AuthUser, ids: string[]): Promise<{ unread: number }> {
    await this.prisma.notification.updateMany({
      where: { ...this.owner(user), id: { in: ids } },
      data: { archivedAt: new Date(), readAt: new Date() },
    });
    return this.pushCount(user);
  }

  private async pushCount(user: AuthUser): Promise<{ unread: number }> {
    const unread = await this.unreadCount({ type: user.typ, id: user.id });
    const room = user.typ === 'customer' ? rooms.customer(user.id) : rooms.staffUser(user.id);
    this.realtime.emit(room, 'notification.count', { unread });
    return { unread };
  }

  /** Events a subject can configure: customers see customer-facing events, staff the staff ones. */
  async preferences(user: AuthUser) {
    const keys = user.typ === 'customer' ? CUSTOMER_EVENTS : STAFF_EVENTS;
    const r: Recipient = { type: user.typ, id: user.id };
    const out = [];
    for (const key of keys) {
      const ch = (await this.channelsFor(key, [r])).get(`${r.type}:${r.id}`)!;
      out.push({ eventKey: key, ...ch, locked: !!CATALOG.get(key)?.locked });
    }
    return { items: out };
  }

  async setPreferences(user: AuthUser, items: Array<{ eventKey: string } & Channels>) {
    const allowed = new Set(user.typ === 'customer' ? CUSTOMER_EVENTS : STAFF_EVENTS);
    for (const it of items) {
      if (!allowed.has(it.eventKey)) continue;
      const where = {
        recipientType_recipientId_eventKey: { recipientType: user.typ, recipientId: user.id, eventKey: it.eventKey },
      };
      const data = { inApp: it.inApp, email: it.email, sms: it.sms };
      await this.prisma.notificationPreference.upsert({
        where,
        create: { recipientType: user.typ, recipientId: user.id, eventKey: it.eventKey, ...data },
        update: data,
      });
    }
    return this.preferences(user);
  }
}

/** Events with a customer recipient (docs/06 §3). */
export const CUSTOMER_EVENTS = [
  'viewing.confirmed',
  'viewing.reminder',
  'property.status_changed',
  'property.price_dropped',
  'property.matched_saved_search',
  'booking.created',
  'booking.confirmed',
  'booking.expired',
  'booking.cancelled',
  'booking.completed',
  'payment.paid',
  'payment.failed',
  'payment.transfer_approved',
  'payment.transfer_rejected',
  'payment.refunded',
  'security.new_login',
];

/** Events with a staff recipient. */
export const STAFF_EVENTS = [
  'lead.created',
  'lead.assigned',
  'lead.stage_changed',
  'viewing.requested',
  'viewing.reminder',
  'property.status_changed',
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'payment.paid',
  'payment.transfer_submitted',
  'payment.refunded',
  'payment.anomaly',
  'license.expiring',
  'license.rega_invalid',
  'integration.health_changed',
  'email.bounced',
  'security.new_login',
  'staff.broadcast',
];
