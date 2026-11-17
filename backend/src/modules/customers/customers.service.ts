import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { AppException } from '../../common/errors/app-exception';
import { toCsv } from '../../common/http/csv';
import { normaliseSaudiMobile } from '../../common/security/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CustomerAuthService } from '../auth/customer-auth.service';
import { KeyedHashService } from '../auth/keyed-hash.service';
import { SessionService } from '../auth/session.service';
import { EmailService } from '../email/email.service';
import { listQuerySchema } from '../properties/query';
import { SettingsService } from '../settings/settings.service';

const notFound = () => new AppException('NOT_FOUND', 404, 'العميل غير موجود');
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
export const MAX_FAVORITES = 200;
export const MAX_SAVED_SEARCHES = 20;
/** PDPL: deletion requests are anonymised after this grace period (docs/02 §5). */
export const DELETION_GRACE_DAYS = 30;

/** Saved-search filters: the public list query without paging/sorting/ids. */
export const savedSearchQuery = listQuerySchema.omit({ page: true, pageSize: true, sort: true, ids: true });

/** Customers admin (docs/07 §7) and the customer's own account (docs/02 §5). */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly hasher: KeyedHashService,
    private readonly email: EmailService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────── admin ─────────────

  async list(
    user: AuthUser,
    q: { q?: string; status?: 'active' | 'blocked' | 'deleted'; page: number; pageSize: number },
  ) {
    const and: Prisma.CustomerWhereInput[] = [this.scope.forStaff(user).customers()];
    and.push(q.status ? { status: q.status } : { status: { not: 'deleted' } });
    if (q.q) {
      const t = q.q.trim();
      const digits = t.replace(/\D/g, '');
      and.push({
        OR: [
          { name: { contains: t, mode: 'insensitive' } },
          { email: { contains: t, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : []),
        ],
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          nafathVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { leads: true, bookings: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);
    const items = rows.map(({ _count, ...c }) => ({ ...c, leadsCount: _count.leads, bookingsCount: _count.bookings }));
    return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.ceil(total / q.pageSize) };
  }

  private async loadForStaff(user: AuthUser, id: string) {
    const c = await this.prisma.customer.findFirst({ where: { AND: [{ id }, this.scope.forStaff(user).customers()] } });
    if (!c) throw notFound();
    return c;
  }

  async get(user: AuthUser, id: string) {
    const c = await this.loadForStaff(user, id);
    const leadScope = this.scope.forStaff(user).leads();
    const [leads, viewings, favorites, savedSearches] = await Promise.all([
      this.prisma.lead.findMany({
        where: { AND: [{ customerId: id }, leadScope] },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          number: true,
          type: true,
          stage: true,
          createdAt: true,
          property: { select: { id: true, code: true, title: true } },
        },
      }),
      this.prisma.viewing.findMany({
        where: { AND: [{ customerId: id }, this.scope.forStaff(user).viewings()] },
        orderBy: { scheduledAt: 'desc' },
        take: 50,
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          property: { select: { id: true, code: true, title: true } },
        },
      }),
      this.prisma.favorite.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { createdAt: true, property: { select: { id: true, code: true, title: true } } },
      }),
      this.prisma.savedSearch.findMany({
        where: { customerId: id },
        select: { id: true, name: true, alertEnabled: true, createdAt: true },
      }),
    ]);
    return {
      customer: {
        ...CustomerAuthService.profile(c),
        status: c.status,
        createdAt: c.createdAt,
        lastLoginAt: c.lastLoginAt,
      },
      leads,
      viewings,
      favorites,
      savedSearches,
      bookings: [],
    };
  }

  async setStatus(user: AuthUser, id: string, status: 'active' | 'blocked') {
    const c = await this.loadForStaff(user, id);
    if (c.status === 'deleted') throw new AppException('CUSTOMER_DELETED', 422, 'الحساب محذوف بطلب من العميل');
    if (c.status === status) return this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { status } });
      await this.audit.record(
        {
          action: 'customer.status',
          entityType: 'customer',
          entityId: id,
          before: { status: c.status },
          after: { status },
        },
        tx,
      );
    });
    if (status === 'blocked') await this.sessions.revokeAll('customer', id);
    return this.get(user, id);
  }

  async exportCsv(user: AuthUser, q: { q?: string; status?: 'active' | 'blocked' | 'deleted' }): Promise<string> {
    const { items } = await this.list(user, { ...q, page: 1, pageSize: 10_000 });
    await this.audit.record({
      action: 'customer.export',
      entityType: 'customer',
      entityId: 'csv',
      after: { count: items.length },
    });
    return toCsv(
      ['الاسم', 'الجوال', 'البريد', 'الطلبات', 'الحجوزات', 'آخر دخول', 'تاريخ التسجيل'],
      items.map((c) => [c.name, c.phone, c.email, c.leadsCount, c.bookingsCount, c.lastLoginAt, c.createdAt]),
    );
  }

  // ───────────── customer's own account ─────────────

  private async me(user: AuthUser) {
    const c = await this.prisma.customer.findFirst({ where: { id: user.id, status: 'active' } });
    if (!c) throw new AppException('UNAUTHENTICATED', 401, 'يلزم تسجيل الدخول');
    return c;
  }

  async profile(user: AuthUser) {
    const c = await this.me(user);
    return { ...CustomerAuthService.profile(c), createdAt: c.createdAt };
  }

  /**
   * Name, phone and marketing consent change directly; a new email is only applied after the
   * 6-digit code sent to it is verified (docs/02 §5). Changing the phone clears its verified flag
   * (SMS verification needs an SMS integration, docs/05).
   */
  async updateProfile(
    user: AuthUser,
    b: { name?: string; phone?: string | null; email?: string; marketingConsent?: boolean },
  ) {
    const c = await this.me(user);
    const data: Prisma.CustomerUpdateInput = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.marketingConsent !== undefined) data.marketingConsent = b.marketingConsent;
    if (b.phone !== undefined) {
      const phone = b.phone ? normaliseSaudiMobile(b.phone) : null;
      if (phone !== c.phone) {
        if (phone && (await this.prisma.customer.findFirst({ where: { phone, id: { not: c.id } } }))) {
          throw new AppException('CONFLICT', 409, 'رقم الجوال مستخدم في حساب آخر');
        }
        data.phone = phone;
        data.phoneVerifiedAt = null;
      }
    }
    let pendingEmail: string | null = null;
    if (b.email !== undefined && b.email !== c.email) {
      pendingEmail = b.email;
      await this.sendEmailCode(c.id, b.email);
    }
    if (Object.keys(data).length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.customer.update({ where: { id: c.id }, data });
        await this.audit.record(
          {
            action: 'customer.profile',
            entityType: 'customer',
            entityId: c.id,
            before: { name: c.name, phone: c.phone, marketingConsent: c.marketingConsent },
            after: { name: b.name, phone: b.phone, marketingConsent: b.marketingConsent },
          },
          tx,
        );
      });
    }
    return { customer: await this.profile(user), pendingEmail };
  }

  private codeHash(customerId: string, email: string, code: string): string {
    return this.hasher.hash('otp', `verify-email:${customerId}:${email}:${code}`);
  }

  private async sendEmailCode(customerId: string, email: string): Promise<void> {
    if (await this.prisma.customer.findFirst({ where: { email, id: { not: customerId } } })) {
      throw new AppException('CONFLICT', 409, 'البريد الإلكتروني مستخدم في حساب آخر');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { destination: email, purpose: 'verify_email', consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          channel: 'email',
          destination: email,
          purpose: 'verify_email',
          codeHash: this.codeHash(customerId, email, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      }),
    ]);
    const brand = (await this.settings.get('branding')).fullName;
    await this.email.sendTemplate('otp', email, { brand, code }, { type: 'customer', id: customerId });
  }

  async verifyEmail(user: AuthUser, email: string, code: string) {
    const c = await this.me(user);
    const invalid = () => new AppException('INVALID_CODE', 401, 'الرمز غير صحيح أو منتهي الصلاحية');
    const row = await this.prisma.otpCode.findFirst({
      where: { destination: email, purpose: 'verify_email', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.attempts >= OTP_MAX_ATTEMPTS) throw invalid();
    const expected = Buffer.from(this.codeHash(c.id, email, code));
    const stored = Buffer.from(row.codeHash);
    if (!/^\d{6}$/.test(code) || expected.length !== stored.length || !timingSafeEqual(expected, stored)) {
      await this.prisma.otpCode.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          ...(row.attempts + 1 >= OTP_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
        },
      });
      throw invalid();
    }
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid();
    if (await this.prisma.customer.findFirst({ where: { email, id: { not: c.id } } })) {
      throw new AppException('CONFLICT', 409, 'البريد الإلكتروني مستخدم في حساب آخر');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: c.id }, data: { email, emailVerifiedAt: new Date() } });
      await this.audit.record(
        {
          action: 'customer.email',
          entityType: 'customer',
          entityId: c.id,
          before: { email: c.email },
          after: { email },
        },
        tx,
      );
    });
    return this.profile(user);
  }

  /** PDPL deletion request: sign out everywhere now, anonymise after the grace period (job). */
  async requestDeletion(user: AuthUser): Promise<{ deleteAfter: string }> {
    const c = await this.me(user);
    const at = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: c.id }, data: { status: 'deleted', deletedAt: at } });
      await tx.savedSearch.deleteMany({ where: { customerId: c.id } });
      await tx.favorite.deleteMany({ where: { customerId: c.id } });
      await this.audit.record({ action: 'customer.delete_request', entityType: 'customer', entityId: c.id }, tx);
    });
    await this.sessions.revokeAll('customer', c.id);
    return { deleteAfter: new Date(at.getTime() + DELETION_GRACE_DAYS * 86_400_000).toISOString() };
  }

  /**
   * Anonymises accounts whose deletion grace period has passed (daily job). Leads and viewings stay
   * for the company's records but lose the personal data.
   */
  async anonymiseDeleted(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000);
    const due = await this.prisma.customer.findMany({
      where: { status: 'deleted', deletedAt: { lte: cutoff }, NOT: { name: 'عميل محذوف' } },
      select: { id: true },
      take: 500,
    });
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id },
          data: {
            name: 'عميل محذوف',
            email: null,
            phone: null,
            passwordHash: null,
            nationalIdHash: null,
            nationalIdLast4: null,
            marketingConsent: false,
          },
        });
        await tx.lead.updateMany({
          where: { customerId: id },
          data: { name: 'عميل محذوف', phone: '', email: null, message: null, utm: undefined },
        });
        await tx.notification.deleteMany({ where: { recipientType: 'customer', recipientId: id } });
        await tx.notificationPreference.deleteMany({ where: { recipientType: 'customer', recipientId: id } });
        await this.audit.record({ action: 'customer.anonymise', entityType: 'customer', entityId: id }, tx);
      });
    }
    return due.length;
  }

  /** PDPL export: everything we hold about the customer (docs/02 §5, docs/10). */
  async exportData(customerId: string) {
    const c = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) throw notFound();
    const [leads, viewings, favorites, savedSearches, notifications, bookings] = await Promise.all([
      this.prisma.lead.findMany({
        where: { customerId },
        select: {
          number: true,
          type: true,
          stage: true,
          name: true,
          phone: true,
          email: true,
          message: true,
          preferredDate: true,
          preferredSlot: true,
          createdAt: true,
          property: { select: { code: true, title: true } },
        },
      }),
      this.prisma.viewing.findMany({
        where: { customerId },
        select: { scheduledAt: true, status: true, property: { select: { code: true, title: true } } },
      }),
      this.prisma.favorite.findMany({
        where: { customerId },
        select: { createdAt: true, property: { select: { code: true, title: true } } },
      }),
      this.prisma.savedSearch.findMany({ where: { customerId }, select: { name: true, query: true, createdAt: true } }),
      this.prisma.notification.findMany({
        where: { recipientType: 'customer', recipientId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { title: true, body: true, createdAt: true, readAt: true },
      }),
      this.prisma.booking.findMany({ where: { customerId } }),
    ]);
    await this.audit.record({ action: 'customer.export', entityType: 'customer', entityId: customerId });
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        emailVerifiedAt: c.emailVerifiedAt,
        phoneVerifiedAt: c.phoneVerifiedAt,
        marketingConsent: c.marketingConsent,
        consentAt: c.consentAt,
        createdAt: c.createdAt,
        lastLoginAt: c.lastLoginAt,
      },
      leads,
      viewings,
      favorites,
      savedSearches,
      notifications,
      bookings,
    };
  }

  // ───────────── favorites ─────────────

  async favorites(user: AuthUser): Promise<{ ids: number[] }> {
    const rows = await this.prisma.favorite.findMany({
      where: { customerId: user.id, property: { visibility: 'published', deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      select: { propertyId: true },
    });
    return { ids: rows.map((r) => r.propertyId) };
  }

  /** Merge (login sync of the browser's local favorites, docs/08 §3). */
  async mergeFavorites(user: AuthUser, ids: number[]): Promise<{ ids: number[] }> {
    await this.me(user);
    const existing = await this.prisma.favorite.count({ where: { customerId: user.id } });
    const valid = await this.prisma.property.findMany({
      where: { id: { in: ids }, visibility: 'published', deletedAt: null },
      select: { id: true },
      take: Math.max(0, MAX_FAVORITES - existing),
    });
    await this.prisma.favorite.createMany({
      data: valid.map((p) => ({ customerId: user.id, propertyId: p.id })),
      skipDuplicates: true,
    });
    return this.favorites(user);
  }

  async addFavorite(user: AuthUser, propertyId: number): Promise<{ ids: number[] }> {
    await this.me(user);
    const p = await this.prisma.property.findFirst({
      where: { id: propertyId, visibility: 'published', deletedAt: null },
      select: { id: true },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    if ((await this.prisma.favorite.count({ where: { customerId: user.id } })) >= MAX_FAVORITES) {
      throw new AppException('LIMIT_REACHED', 422, `الحد الأقصى ${MAX_FAVORITES} عقاراً في المفضلة`);
    }
    await this.prisma.favorite.createMany({ data: [{ customerId: user.id, propertyId }], skipDuplicates: true });
    return this.favorites(user);
  }

  async removeFavorite(user: AuthUser, propertyId: number): Promise<{ ids: number[] }> {
    await this.prisma.favorite.deleteMany({ where: { customerId: user.id, propertyId } });
    return this.favorites(user);
  }

  // ───────────── saved searches ─────────────

  private async assertSavedSearchesOn(): Promise<void> {
    if (!(await this.settings.get('features')).savedSearches) {
      throw new AppException('FEATURE_DISABLED', 404, 'الميزة غير مفعّلة');
    }
  }

  async savedSearches(user: AuthUser) {
    await this.assertSavedSearchesOn();
    const items = await this.prisma.savedSearch.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, query: true, alertEnabled: true, lastNotifiedAt: true, createdAt: true },
    });
    return { items };
  }

  async createSavedSearch(user: AuthUser, b: { name: string; query: Record<string, string>; alertEnabled: boolean }) {
    await this.assertSavedSearchesOn();
    await this.me(user);
    if ((await this.prisma.savedSearch.count({ where: { customerId: user.id } })) >= MAX_SAVED_SEARCHES) {
      throw new AppException('LIMIT_REACHED', 422, `الحد الأقصى ${MAX_SAVED_SEARCHES} بحثاً محفوظاً`);
    }
    const s = await this.prisma.savedSearch.create({
      data: {
        customerId: user.id,
        name: b.name,
        query: b.query,
        alertEnabled: b.alertEnabled,
        // Alerts cover listings published after the search was saved.
        lastNotifiedAt: new Date(),
      },
      select: { id: true, name: true, query: true, alertEnabled: true, lastNotifiedAt: true, createdAt: true },
    });
    return s;
  }

  async updateSavedSearch(user: AuthUser, id: string, b: { name?: string; alertEnabled?: boolean }) {
    await this.assertSavedSearchesOn();
    const r = await this.prisma.savedSearch.updateMany({ where: { id, customerId: user.id }, data: b });
    if (!r.count) throw new AppException('NOT_FOUND', 404, 'البحث غير موجود');
    return this.prisma.savedSearch.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, query: true, alertEnabled: true, lastNotifiedAt: true, createdAt: true },
    });
  }

  async deleteSavedSearch(user: AuthUser, id: string): Promise<void> {
    const r = await this.prisma.savedSearch.deleteMany({ where: { id, customerId: user.id } });
    if (!r.count) throw new AppException('NOT_FOUND', 404, 'البحث غير موجود');
  }

  // ───────────── viewings ─────────────

  async myViewings(user: AuthUser) {
    const rows = await this.prisma.viewing.findMany({
      where: { customerId: user.id },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      select: {
        id: true,
        scheduledAt: true,
        durationMin: true,
        status: true,
        lead: { select: { number: true } },
        agent: { select: { name: true, phone: true, whatsapp: true } },
        property: {
          select: {
            id: true,
            code: true,
            title: true,
            slug: true,
            media: { where: { isCover: true, status: 'ready' }, select: { variants: true }, take: 1 },
            city: { select: { nameAr: true } },
            district: { select: { nameAr: true } },
          },
        },
      },
    });
    // Leads without a slot yet (e.g. «قائمة انتظار», «شراء») show as requests.
    const leads = await this.prisma.lead.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        type: true,
        stage: true,
        createdAt: true,
        property: { select: { id: true, title: true, slug: true } },
      },
    });
    return {
      viewings: rows.map(({ property: { media, ...p }, ...v }) => ({
        ...v,
        property: {
          ...p,
          url: `/property/${p.id}-${p.slug}`,
          cover: (media[0]?.variants as { card?: string } | null)?.card ?? null,
        },
      })),
      requests: leads.map((l) => ({
        ...l,
        property: l.property ? { ...l.property, url: `/property/${l.property.id}-${l.property.slug}` } : null,
      })),
    };
  }

  async cancelViewing(user: AuthUser, id: string) {
    const v = await this.prisma.viewing.findFirst({ where: { id, customerId: user.id } });
    if (!v) throw new AppException('NOT_FOUND', 404, 'الموعد غير موجود');
    if (!['requested', 'confirmed'].includes(v.status) || v.scheduledAt < new Date()) {
      throw new AppException('VIEWING_NOT_CANCELLABLE', 422, 'لا يمكن إلغاء هذا الموعد');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.viewing.update({ where: { id }, data: { status: 'cancelled' } });
      if (v.leadId) {
        await tx.leadActivity.create({
          data: { leadId: v.leadId, type: 'viewing', meta: { viewingId: id, status: 'cancelled', by: 'customer' } },
        });
      }
      await this.audit.record(
        {
          action: 'viewing.cancel',
          entityType: 'viewing',
          entityId: id,
          before: { status: v.status },
          after: { status: 'cancelled' },
        },
        tx,
      );
    });
    return this.myViewings(user);
  }
}
