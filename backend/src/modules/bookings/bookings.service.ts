import { Inject, Injectable } from '@nestjs/common';
import type { Booking, BookingStatus, PaymentMethod, PaymentType, Prisma } from '@prisma/client';
import { Prisma as P } from '@prisma/client';
import type Redis from 'ioredis';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { nextCounter } from '../../common/counter';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import type { AuthUser } from '../auth/auth.types';
import { type NextAction, PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../settings/settings.service';
import { ACTIVE_BOOKING, BookingTransitions, type PendingEvent } from './booking-transitions';
import {
  amountFor,
  holdMs,
  methodsFor,
  paymentTypesFor,
  type PropertyLike,
  resolvePolicy,
  unavailableReason,
} from './quote';

const unavailable = () => new AppException('BOOKING_PROPERTY_UNAVAILABLE', 409, 'العقار غير متاح للحجز حالياً');
const notFound = () => new AppException('NOT_FOUND', 404, 'الحجز غير موجود');

const PROPERTY_SELECT = {
  id: true,
  title: true,
  slug: true,
  code: true,
  offer: true,
  price: true,
  rentPeriod: true,
  status: true,
  visibility: true,
  bookingEnabled: true,
  deletedAt: true,
  paymentPolicy: true,
  agentId: true,
} satisfies Prisma.PropertySelect;

export const BOOKING_DETAIL = {
  property: {
    select: {
      id: true,
      code: true,
      title: true,
      slug: true,
      offer: true,
      status: true,
      agentId: true,
      media: { where: { isCover: true, status: 'ready' }, select: { variants: true }, take: 1 },
      district: { select: { nameAr: true } },
      city: { select: { nameAr: true } },
      agent: { select: { id: true, name: true, phone: true, whatsapp: true } },
    },
  },
  customer: {
    select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true, nafathVerifiedAt: true },
  },
  payments: {
    orderBy: { createdAt: 'asc' },
    include: {
      transfer: { include: { bankAccount: { select: { id: true, bankName: true, iban: true } } } },
      events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true } },
    },
  },
} satisfies Prisma.BookingInclude;

/** Removes storage keys and provider payloads before sending a booking to a browser. */
function present<T extends { payments: Array<Record<string, unknown> & { transfer: unknown }> }>(b: T) {
  return {
    ...b,
    payments: b.payments.map((p) => {
      const {
        providerPayload: _pp,
        idempotencyKey: _ik,
        transfer,
        ...rest
      } = p as Record<string, unknown> & {
        transfer: (Record<string, unknown> & { receiptKey?: string }) | null;
      };
      void _pp;
      void _ik;
      if (!transfer) return { ...rest, transfer: null };
      const { receiptKey, ...t } = transfer;
      return { ...rest, transfer: { ...t, hasReceipt: !!receiptKey } };
    }),
  };
}

/**
 * Bookings (docs/04): quote, creation with row lock + partial unique index, the customer's and the
 * admin's actions, and hold expiry. Payments are delegated to PaymentsService.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly transitions: BookingTransitions,
    private readonly scope: AccessScopeService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private async context() {
    const [booking, payments, features, ready] = await Promise.all([
      this.settings.get('booking'),
      this.settings.get('payments'),
      this.settings.get('features'),
      this.payments.readyMethods(),
    ]);
    return { booking, payments, features, ready };
  }

  private async loadProperty(id: number) {
    const p = await this.prisma.property.findUnique({ where: { id }, select: PROPERTY_SELECT });
    if (!p || p.deletedAt || p.visibility !== 'published') throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    return p;
  }

  /** Public payload block `booking` (docs/02 §3): what the property page needs to show «احجز العقار». */
  async publicBlock(p: PropertyLike & { id: number }, ctx?: Awaited<ReturnType<BookingsService['context']>>) {
    const c = ctx ?? (await this.context());
    const policy = resolvePolicy(c.booking, p);
    const types = paymentTypesFor(policy, c.payments, c.ready, p);
    const active = await this.prisma.booking.count({ where: { propertyId: p.id, status: { in: ACTIVE_BOOKING } } });
    const reason = unavailableReason(c.booking, c.features.booking, p);
    const enabled = !reason && types.length > 0;
    const methods = [...new Set(types.flatMap((t) => methodsFor(policy, t, c.payments, c.ready, p)))];
    return {
      enabled,
      busy: active > 0,
      paymentTypes: enabled ? types : [],
      depositAmount: types.includes('deposit') ? Number(amountFor(policy, p, 'deposit')) : null,
      fullAmount: Number(amountFor(policy, p, 'full')),
      methods: enabled ? methods : [],
    };
  }

  /** POST /me/bookings/quote (docs/02 §5). */
  async quote(propertyId: number, paymentType?: PaymentType) {
    const c = await this.context();
    const p = await this.loadProperty(propertyId);
    const reason = unavailableReason(c.booking, c.features.booking, p);
    if (reason === 'PROPERTY_UNAVAILABLE') throw unavailable();
    if (reason) throw new AppException('BOOKING_NOT_AVAILABLE', 422, 'الحجز غير متاح لهذا العقار');
    if (await this.prisma.booking.count({ where: { propertyId, status: { in: ACTIVE_BOOKING } } })) throw unavailable();
    const policy = resolvePolicy(c.booking, p);
    const types = paymentTypesFor(policy, c.payments, c.ready, p);
    if (!types.length) throw new AppException('BOOKING_NOT_AVAILABLE', 422, 'لا توجد طريقة دفع متاحة حالياً');
    const type =
      paymentType && types.includes(paymentType)
        ? paymentType
        : types.includes(policy.defaultPaymentType)
          ? policy.defaultPaymentType
          : types[0]!;
    const methods = methodsFor(policy, type, c.payments, c.ready, p);
    const amountDue = amountFor(policy, p, type);
    return {
      property: { id: p.id, code: p.code, title: p.title, offer: p.offer, rentPeriod: p.rentPeriod },
      priceHalalas: Number(p.price),
      paymentType: type,
      paymentTypes: types,
      options: Object.fromEntries(types.map((t) => [t, Number(amountFor(policy, p, t))])),
      amountDue: Number(amountDue),
      methods: methods.map((m) => ({
        method: m,
        labelAr: c.payments[m].labelAr,
        holdMinutes: Math.round(holdMs(c.booking, m) / 60_000),
      })),
      holdMinutes: Math.round(holdMs(c.booking, methods[0] ?? 'moyasar') / 60_000),
      termsVersion: c.booking.termsVersion,
      termsHtml: c.booking.termsHtml,
      cancellationPolicyHtml: c.booking.cancellationPolicyHtml,
      nafathRequired: c.booking.nafathRequiredAbove !== null && amountDue > BigInt(c.booking.nafathRequiredAbove),
      vatNoteAr: c.payments.showVatNote ? c.payments.vatNoteAr : null,
    };
  }

  /** POST /me/bookings (docs/04 §3.5). */
  async create(
    user: AuthUser,
    dto: {
      propertyId: number;
      paymentType: PaymentType;
      paymentMethod: PaymentMethod;
      termsVersion: string;
      notes?: string | null;
    },
    idempotencyKey?: string,
  ): Promise<{ booking: unknown; nextAction: NextAction | null; paymentError?: string }> {
    const idem =
      idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)
        ? `idem:booking:${user.id}:${idempotencyKey}`
        : null;
    if (idem) {
      const prev = await this.redis.get(idem);
      if (prev) return this.resume(user, prev);
    }
    const c = await this.context();
    if (dto.termsVersion !== c.booking.termsVersion) {
      throw new AppException('TERMS_OUTDATED', 409, 'تم تحديث شروط الحجز، يرجى مراجعتها والموافقة عليها من جديد');
    }
    const customer = await this.prisma.customer.findFirst({ where: { id: user.id, status: 'active' } });
    if (!customer) throw new AppException('UNAUTHENTICATED', 401, 'يلزم تسجيل الدخول');

    const events: PendingEvent[] = [];
    let created: Booking;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Serialise bookings of the same property; the partial unique index is the second line.
        await tx.$queryRaw`SELECT id FROM "Property" WHERE id = ${dto.propertyId} FOR UPDATE`;
        const p = await tx.property.findUnique({ where: { id: dto.propertyId }, select: PROPERTY_SELECT });
        if (!p || p.deletedAt || p.visibility !== 'published')
          throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
        const reason = unavailableReason(c.booking, c.features.booking, p);
        if (reason === 'PROPERTY_UNAVAILABLE') throw unavailable();
        if (reason) throw new AppException('BOOKING_NOT_AVAILABLE', 422, 'الحجز غير متاح لهذا العقار');
        if (await tx.booking.count({ where: { propertyId: p.id, status: { in: ACTIVE_BOOKING } } }))
          throw unavailable();

        const policy = resolvePolicy(c.booking, p);
        if (!paymentTypesFor(policy, c.payments, c.ready, p).includes(dto.paymentType)) {
          throw new AppException('VALIDATION_FAILED', 400, 'نوع الدفع غير متاح', {
            fields: { paymentType: 'not_available' },
          });
        }
        if (!methodsFor(policy, dto.paymentType, c.payments, c.ready, p).includes(dto.paymentMethod)) {
          throw new AppException('VALIDATION_FAILED', 400, 'طريقة الدفع غير متاحة', {
            fields: { paymentMethod: 'not_available' },
          });
        }
        const amountDue = amountFor(policy, p, dto.paymentType);
        if (
          c.booking.nafathRequiredAbove !== null &&
          amountDue > BigInt(c.booking.nafathRequiredAbove) &&
          !customer.nafathVerifiedAt
        ) {
          throw new AppException('NAFATH_REQUIRED', 422, 'يتطلب هذا الحجز التحقق من الهوية عبر النفاذ الوطني');
        }
        const year = new Date().getUTCFullYear();
        const number = `B-${year}-${String(await nextCounter(tx, `booking:${year}`)).padStart(6, '0')}`;
        const b = await tx.booking.create({
          data: {
            number,
            propertyId: p.id,
            customerId: customer.id,
            offerSnapshot: p.offer,
            priceSnapshot: p.price,
            rentPeriodSnapshot: p.rentPeriod,
            paymentType: dto.paymentType,
            paymentMethod: dto.paymentMethod,
            amountDue,
            holdExpiresAt: new Date(Date.now() + holdMs(c.booking, dto.paymentMethod)),
            termsVersion: dto.termsVersion,
            termsAcceptedAt: new Date(),
            customerNotes: dto.notes || null,
          },
        });
        await this.payments.createPaymentRow(tx, b, dto.paymentMethod);
        await tx.auditLog.create({
          data: {
            actorType: 'customer',
            actorId: customer.id,
            action: 'booking.create',
            entityType: 'booking',
            entityId: b.id,
            after: {
              number,
              propertyId: p.id,
              paymentType: dto.paymentType,
              method: dto.paymentMethod,
              amountDue: amountDue.toString(),
            },
          },
        });
        events.push(['booking.created', { bookingId: b.id }], ['booking.updated', { bookingId: b.id }]);
        return b;
      });
    } catch (e) {
      if (e instanceof P.PrismaClientKnownRequestError && e.code === 'P2002') throw unavailable();
      throw e;
    }
    this.payments.emitAll(events);
    if (idem) await this.redis.set(idem, created.id, 'EX', 24 * 3600);
    return this.resume(user, created.id);
  }

  /** The booking + the next action of its open payment (also used for idempotent replays). */
  private async resume(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: user.id },
      include: { property: { select: { title: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!b) throw notFound();
    const payment = b.payments[0];
    let nextAction: NextAction | null = null;
    let paymentError: string | undefined;
    if (payment && b.status === 'pending_payment' && ['initiated', 'pending', 'rejected'].includes(payment.status)) {
      try {
        nextAction =
          payment.method === 'moyasar' && payment.providerUrl
            ? { type: 'redirect', url: payment.providerUrl }
            : await this.payments.start(b, payment);
      } catch (e) {
        paymentError = e instanceof AppException ? e.messageAr : 'تعذّر بدء الدفع';
      }
    }
    return { booking: await this.mine(user, bookingId), nextAction, ...(paymentError ? { paymentError } : {}) };
  }

  /** POST /me/bookings/:id/pay — another attempt (e.g. after a failed card payment), same hold. */
  async payAgain(user: AuthUser, bookingId: string, method: PaymentMethod) {
    const c = await this.context();
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: user.id },
      include: { property: { select: PROPERTY_SELECT } },
    });
    if (!b) throw notFound();
    if (b.status !== 'pending_payment' || b.holdExpiresAt < new Date()) {
      throw new AppException('BOOKING_INVALID_TRANSITION', 422, 'لا يمكن الدفع لهذا الحجز');
    }
    const policy = resolvePolicy(c.booking, b.property);
    if (!methodsFor(policy, b.paymentType, c.payments, c.ready, b.property).includes(method)) {
      throw new AppException('VALIDATION_FAILED', 400, 'طريقة الدفع غير متاحة', {
        fields: { method: 'not_available' },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { bookingId, status: { in: ['initiated', 'pending', 'failed', 'rejected'] } },
        data: { status: 'cancelled' },
      });
      await tx.booking.update({ where: { id: bookingId }, data: { paymentMethod: method } });
      await this.payments.createPaymentRow(tx, { ...b, paymentMethod: method }, method);
    });
    return this.resume(user, bookingId);
  }

  // ───────────── customer views ─────────────

  async myList(user: AuthUser) {
    const rows = await this.prisma.booking.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: BOOKING_DETAIL,
      take: 100,
    });
    return { items: rows.map(present) };
  }

  async mine(user: AuthUser, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, customerId: user.id }, include: BOOKING_DETAIL });
    if (!b) throw notFound();
    return present(b);
  }

  /** Customer cancel: allowed while pending payment or awaiting transfer review (docs/02 §5). */
  async cancelByCustomer(user: AuthUser, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, customerId: user.id } });
    if (!b) throw notFound();
    if (b.status !== 'pending_payment' && b.status !== 'awaiting_transfer_review') {
      throw new AppException('BOOKING_INVALID_TRANSITION', 422, 'لا يمكن إلغاء الحجز في حالته الحالية، تواصل معنا');
    }
    await this.close(b, 'cancelled', { type: 'customer', id: user.id }, 'customer_cancelled');
    return this.mine(user, id);
  }

  /** Cancels open payment attempts and moves the booking to a closed state. */
  private async close(
    b: Booking,
    to: BookingStatus,
    actor: { type: 'staff' | 'customer' | 'system'; id: string | null },
    reason: string,
  ) {
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      const cur = await tx.booking.findUniqueOrThrow({ where: { id: b.id } });
      await tx.payment.updateMany({
        where: { bookingId: b.id, status: { in: ['initiated', 'pending', 'rejected', 'under_review'] } },
        data: { status: 'cancelled' },
      });
      events.push(...(await this.transitions.apply(tx, cur, to, { actor, reason })));
    });
    this.payments.emitAll(events);
  }

  // ───────────── admin ─────────────

  async adminList(user: AuthUser, q: { status?: BookingStatus; q?: string; page: number; pageSize: number }) {
    const and: Prisma.BookingWhereInput[] = [this.scope.forStaff(user).bookings()];
    if (q.status) and.push({ status: q.status });
    if (q.q) {
      const t = q.q.trim();
      and.push({
        OR: [
          { number: { contains: t.toUpperCase() } },
          { customer: { name: { contains: t, mode: 'insensitive' } } },
          { property: { title: { contains: t, mode: 'insensitive' } } },
        ],
      });
    }
    const where = { AND: and };
    const [rows, total, counts] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          property: {
            select: {
              id: true,
              code: true,
              title: true,
              media: { where: { isCover: true, status: 'ready' }, select: { variants: true }, take: 1 },
            },
          },
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.booking.count({ where }),
      this.prisma.booking.groupBy({ by: ['status'], where: this.scope.forStaff(user).bookings(), _count: true }),
    ]);
    return {
      items: rows,
      total,
      page: q.page,
      pageSize: q.pageSize,
      pages: Math.ceil(total / q.pageSize),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    };
  }

  async adminGet(user: AuthUser, id: string) {
    const b = await this.prisma.booking.findFirst({
      where: { AND: [{ id }, this.scope.forStaff(user).bookings()] },
      include: BOOKING_DETAIL,
    });
    if (!b) throw notFound();
    const history = await this.prisma.auditLog.findMany({
      where: { entityType: 'booking', entityId: id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorType: true, actorId: true, createdAt: true, after: true },
    });
    return { ...present(b), history };
  }

  private async loadForStaff(user: AuthUser, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { AND: [{ id }, this.scope.forStaff(user).bookings()] } });
    if (!b) throw notFound();
    return b;
  }

  /** Manual confirmation (e.g. auto-confirm off) — only when the amount due has been received. */
  async adminConfirm(user: AuthUser, id: string) {
    const b = await this.loadForStaff(user, id);
    if (b.amountPaid < b.amountDue) {
      throw new AppException('BOOKING_NOT_PAID', 422, 'لم يُستلم المبلغ المستحق بعد');
    }
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      events.push(...(await this.transitions.apply(tx, b, 'confirmed', { actor: { type: 'staff', id: user.id } })));
    });
    this.payments.emitAll(events);
    return this.adminGet(user, id);
  }

  async adminComplete(user: AuthUser, id: string) {
    const b = await this.loadForStaff(user, id);
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      events.push(...(await this.transitions.apply(tx, b, 'completed', { actor: { type: 'staff', id: user.id } })));
    });
    this.payments.emitAll(events);
    return this.adminGet(user, id);
  }

  async adminCancel(user: AuthUser, id: string, reason: string) {
    const b = await this.loadForStaff(user, id);
    await this.close(b, 'cancelled', { type: 'staff', id: user.id }, reason);
    return this.adminGet(user, id);
  }

  async adminExtendHold(user: AuthUser, id: string, hours: number) {
    const b = await this.loadForStaff(user, id);
    if (b.status !== 'pending_payment' && b.status !== 'awaiting_transfer_review') {
      throw new AppException('BOOKING_INVALID_TRANSITION', 422, 'لا يمكن تمديد المهلة في حالة الحجز الحالية');
    }
    const base = b.holdExpiresAt > new Date() ? b.holdExpiresAt : new Date();
    const until = new Date(base.getTime() + hours * 3_600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { holdExpiresAt: until } });
      await tx.auditLog.create({
        data: {
          actorType: 'staff',
          actorId: user.id,
          action: 'booking.extend_hold',
          entityType: 'booking',
          entityId: id,
          before: { holdExpiresAt: b.holdExpiresAt.toISOString() },
          after: { holdExpiresAt: until.toISOString(), hours },
        },
      });
    });
    this.payments.emitAll([['booking.updated', { bookingId: id }]]);
    return this.adminGet(user, id);
  }

  // ───────────── jobs ─────────────

  /**
   * Expires unpaid holds (job). Online payments are reconciled first so a payment completed at the last
   * second is not lost. Bookings awaiting transfer review wait for the reviewer (docs/QUESTIONS #44).
   */
  async expireHolds(now = new Date()): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: { status: 'pending_payment', holdExpiresAt: { lt: now } },
      include: {
        payments: { where: { method: 'moyasar', status: { in: ['initiated', 'pending'] } }, select: { id: true } },
      },
      take: 200,
    });
    let expired = 0;
    for (const b of due) {
      for (const p of b.payments) await this.payments.reconcile(p.id, { source: 'expiry' });
      const cur = await this.prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
      if (cur.status !== 'pending_payment') continue;
      await this.close(cur, 'expired', { type: 'system', id: null }, 'hold_expired');
      expired++;
    }
    return expired;
  }
}
