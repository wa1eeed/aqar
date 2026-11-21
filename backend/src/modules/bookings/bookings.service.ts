import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { SettingsService } from '../settings/settings.service.js';
import { uniqueCode } from '../../common/code.js';
import { formatSar } from '../../common/money.js';
import { computeQuote, type Policy } from './quote.js';
import { moyasarCreateCheckout, moyasarFetchInvoice, moyasarFetchPayment, moyasarRefund, moyasarVerifyWebhook, type MoyasarCtx } from './providers/moyasar.js';

const ACTIVE = ['pending_payment', 'awaiting_transfer_review', 'confirmed'] as const;

export const createBookingSchema = z.object({
  propertyId: z.number().int(),
  paymentType: z.enum(['deposit', 'full']),
  paymentMethod: z.enum(['moyasar', 'bank_transfer', 'rize']),
  termsVersion: z.string(),
  notes: z.string().optional(),
});

interface BookingSettings {
  enabled: boolean;
  allowedOffers: string[];
  policies: Record<string, Policy>;
  holdMinutesOnline: number;
  holdHoursTransfer: number;
  reviewHoursTransfer: number;
  autoConfirmWhenPaid: boolean;
  termsVersion: string;
  termsHtml: string;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
  ) {}

  private async bookingSettings(): Promise<BookingSettings> {
    return (await this.settings.get('booking')) as BookingSettings;
  }

  private policyFor(s: BookingSettings, property: { offer: string; paymentPolicy: unknown }): Policy {
    const override = property.paymentPolicy as Policy | null;
    return override ?? s.policies[property.offer];
  }

  // ───────────────── Quote ─────────────────
  async quote(propertyId: number, paymentType: 'deposit' | 'full') {
    const property = await this.prisma.scoped.property.findFirst({
      where: { id: propertyId, visibility: 'published' },
      select: { id: true, offer: true, price: true, paymentPolicy: true, bookingEnabled: true },
    });
    if (!property) throw new NotFoundException('العقار غير موجود');
    const s = await this.bookingSettings();
    const policy = this.policyFor(s, property);
    const q = computeQuote(policy, Number(property.price), paymentType);
    const methods = await this.availableMethods(policy, paymentType, property.offer);
    const online = methods.some((m) => m === 'moyasar' || m === 'rize');
    return {
      amountDue: q.amountDue,
      depositAmount: q.depositAmount,
      fullAmount: q.fullAmount,
      priceHalalas: Number(property.price),
      paymentTypes: policy.paymentTypes,
      methods,
      holdMinutes: online ? s.holdMinutesOnline : s.holdHoursTransfer * 60,
      termsVersion: s.termsVersion,
      termsHtml: s.termsHtml,
    };
  }

  private async availableMethods(policy: Policy, paymentType: 'deposit' | 'full', offer: string): Promise<string[]> {
    const payments = (await this.settings.get('payments')) as {
      moyasar: { enabled: boolean };
      bank_transfer: { enabled: boolean };
      rize: { enabled: boolean; onlyRentPeriods: string[] };
    };
    const allowed = policy.methods[paymentType] ?? [];
    const out: string[] = [];
    for (const m of allowed) {
      if (m === 'moyasar' && payments.moyasar.enabled && (await this.integrationReady('payments.moyasar'))) out.push(m);
      else if (m === 'bank_transfer' && payments.bank_transfer.enabled) out.push(m);
      else if (m === 'rize' && payments.rize.enabled && offer === 'rent' && paymentType === 'full') out.push(m);
    }
    return out;
  }

  private async integrationReady(key: string): Promise<boolean> {
    const row = await this.prisma.integration.findUnique({
      where: { tenantId_key: { tenantId: this.tenant.requireTenantId(), key } },
      select: { enabled: true },
    });
    return !!row?.enabled;
  }

  // ───────────────── Create (with lock) ─────────────────
  async create(customerId: string, input: z.infer<typeof createBookingSchema>) {
    const tenantId = this.tenant.requireTenantId();
    const data = createBookingSchema.parse(input);
    const s = await this.bookingSettings();
    if (!s.enabled) throw new BadRequestException('الحجز غير مُفعّل');

    const result = await this.prisma.$transaction(async (tx) => {
      // قفل صف العقار
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Property" WHERE id = ${data.propertyId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('العقار غير موجود');
      const property = await tx.property.findFirst({ where: { id: data.propertyId, tenantId } });
      if (!property || property.visibility !== 'published' || property.status !== 'available' || !property.bookingEnabled) {
        throw new ConflictException({ code: 'BOOKING_PROPERTY_UNAVAILABLE', message: 'العقار غير متاح للحجز حالياً' });
      }
      const active = await tx.booking.findFirst({ where: { tenantId, propertyId: data.propertyId, status: { in: [...ACTIVE] } } });
      if (active) throw new ConflictException({ code: 'BOOKING_PROPERTY_UNAVAILABLE', message: 'العقار قيد الحجز حالياً' });

      const policy = this.policyFor(s, property);
      const q = computeQuote(policy, Number(property.price), data.paymentType);
      const online = data.paymentMethod === 'moyasar' || data.paymentMethod === 'rize';
      const holdExpiresAt = new Date(Date.now() + (online ? s.holdMinutesOnline : s.holdHoursTransfer * 60) * 60_000);
      const number = await uniqueCode('B', (c) => tx.booking.findFirst({ where: { tenantId, number: c }, select: { id: true } }).then((r) => !!r));

      const booking = await tx.booking.create({
        data: {
          tenantId, number, propertyId: property.id, customerId,
          offerSnapshot: property.offer, priceSnapshot: property.price, rentPeriodSnapshot: property.rentPeriod,
          paymentType: data.paymentType, paymentMethod: data.paymentMethod,
          amountDue: BigInt(q.amountDue), status: 'pending_payment', holdExpiresAt,
          termsVersion: s.termsVersion, termsAcceptedAt: new Date(), customerNotes: data.notes ?? null,
        },
      });
      const payment = await tx.payment.create({
        data: {
          tenantId, bookingId: booking.id, method: data.paymentMethod, amount: BigInt(q.amountDue),
          idempotencyKey: `pay_${booking.id}_${Date.now()}`, status: 'initiated',
        },
      });
      return { booking, payment, property };
    });

    await this.audit.record({ tenantId, actorType: 'customer', actorId: customerId, action: 'booking.created', entityType: 'Booking', entityId: result.booking.id, after: { number: result.booking.number } });
    this.notifyBooking('booking.created', result.booking, [{ type: 'customer', id: customerId }], `تم إنشاء الحجز ${result.booking.number}`);

    const nextAction = await this.initPayment(result.booking, result.payment, data.paymentMethod);
    return { booking: result.booking, nextAction };
  }

  private async initPayment(booking: { id: string; number: string }, payment: { id: string; amount: bigint }, method: string) {
    if (method === 'moyasar') {
      const callbackUrl = `${this.config.get('PUBLIC_URL') ?? ''}/account/booking.html#b-${booking.id}`;
      const res = await this.integrations.call('payments.moyasar', 'createCheckout', (ctx) =>
        moyasarCreateCheckout(ctx as unknown as MoyasarCtx, {
          paymentId: payment.id, bookingNumber: booking.number, amount: payment.amount,
          descriptionAr: `حجز ${booking.number}`, callbackUrl,
          metadata: { bookingId: booking.id, paymentId: payment.id, bookingNumber: booking.number },
        }),
      );
      await this.prisma.scoped.payment.update({ where: { id: payment.id }, data: { providerInvoiceId: res.providerId ?? null, providerUrl: res.url ?? null, status: 'pending' } });
      if (res.url) return { type: 'redirect', url: res.url };
      return { type: 'moyasar_form', ...res.formConfig };
    }
    if (method === 'bank_transfer') {
      const bt = (await this.settings.get('bank_transfer')) as { bankAccountIds: string[]; instructionsHtml: string; nextSteps: string[] };
      const accounts = await this.prisma.scoped.bankAccount.findMany({ where: { isActive: true }, orderBy: { sort: 'asc' } });
      return {
        type: 'bank_transfer',
        accounts, amount: Number(payment.amount), reference: booking.number,
        instructionsHtml: bt.instructionsHtml, nextSteps: bt.nextSteps,
      };
    }
    throw new BadRequestException('طريقة الدفع غير مُهيّأة');
  }

  // ───────────────── Reconcile (Moyasar) ─────────────────
  async reconcile(paymentId: string): Promise<{ status: string }> {
    const payment = await this.prisma.scoped.payment.findFirst({ where: { id: paymentId }, include: { booking: true } });
    if (!payment) throw new NotFoundException('الدفعة غير موجودة');
    if (payment.status === 'paid') return { status: 'paid' };

    const fetched = await this.integrations.call('payments.moyasar', 'fetchPayment', (ctx) =>
      payment.providerInvoiceId
        ? moyasarFetchInvoice(ctx as unknown as MoyasarCtx, payment.providerInvoiceId)
        : moyasarFetchPayment(ctx as unknown as MoyasarCtx, payment.providerPaymentId ?? ''),
    );

    if (fetched.status !== 'paid') {
      await this.prisma.scoped.payment.update({ where: { id: paymentId }, data: { status: fetched.status === 'failed' ? 'failed' : 'pending', providerStatus: fetched.status } });
      return { status: fetched.status };
    }
    if (fetched.amount !== payment.amount || fetched.currency !== 'SAR') {
      await this.prisma.scoped.payment.update({ where: { id: paymentId }, data: { status: 'failed', failureReason: 'AMOUNT_MISMATCH' } });
      await this.notifyAnomaly(payment.booking.number);
      return { status: 'failed' };
    }
    await this.markPaid(payment.id, payment.bookingId, fetched.providerPaymentId);
    return { status: 'paid' };
  }

  private async markPaid(paymentId: string, bookingId: string, providerPaymentId?: string) {
    const tenantId = this.tenant.requireTenantId();
    const receiptNumber = await uniqueCode('R', (c) => this.prisma.scoped.payment.findFirst({ where: { receiptNumber: c }, select: { id: true } }).then((r) => !!r));
    const s = await this.bookingSettings();

    await this.prisma.$transaction(async (tx) => {
      const pay = await tx.payment.findFirst({ where: { id: paymentId, tenantId } });
      if (!pay || pay.status === 'paid') return; // idempotent
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'paid', paidAt: new Date(), providerPaymentId: providerPaymentId ?? pay.providerPaymentId, receiptNumber } });
      await tx.paymentEvent.create({ data: { tenantId, paymentId, type: 'paid' } });
      const booking = await tx.booking.update({ where: { id: bookingId }, data: { amountPaid: { increment: pay.amount } } });
      if (Number(booking.amountPaid) >= Number(booking.amountDue) && s.autoConfirmWhenPaid) {
        await this.confirmInTx(tx, tenantId, booking.id);
      }
    });
    const booking = await this.prisma.scoped.booking.findFirst({ where: { id: bookingId }, include: { property: true } });
    if (booking) {
      this.notifyBooking('payment.paid', booking, [{ type: 'customer', id: booking.customerId }], `تم استلام دفعتك ${formatSar(booking.amountPaid)}`, true);
      this.realtime.toCustomer(booking.customerId, 'booking.updated', { id: booking.id, status: booking.status });
    }
  }

  private async confirmInTx(tx: Prisma.TransactionClient, tenantId: string, bookingId: string) {
    const booking = await tx.booking.update({ where: { id: bookingId }, data: { status: 'confirmed', confirmedAt: new Date() } });
    const property = await tx.property.findFirst({ where: { id: booking.propertyId, tenantId } });
    if (property && property.status === 'available') {
      await tx.property.update({ where: { id: property.id }, data: { status: 'reserved' } });
      await tx.propertyStatusHistory.create({ data: { tenantId, propertyId: property.id, from: property.status, to: 'reserved', reason: 'booking_confirmed', bookingId, actorType: 'system' } });
    }
  }

  // ───────────────── Bank transfer ─────────────────
  async presignTransfer(paymentId: string, customerId: string, contentType: string) {
    const tenantId = this.tenant.requireTenantId();
    const payment = await this.prisma.scoped.payment.findFirst({ where: { id: paymentId }, include: { booking: true } });
    if (!payment || payment.booking.customerId !== customerId) throw new NotFoundException('الدفعة غير موجودة');
    const ext = (contentType.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '');
    const key = `tenants/${tenantId}/transfers/${paymentId}/${randomUUID()}.${ext}`;
    const { url, headers } = await this.integrations.presignPut('uploads', key, contentType, 10 * 1024 * 1024);
    return { uploadUrl: url, headers, key };
  }

  async submitTransfer(paymentId: string, customerId: string, data: { bankAccountId: string; senderName: string; senderBank: string; transferReference?: string; transferredAt: string; amount: number; receiptKey: string }) {
    const tenantId = this.tenant.requireTenantId();
    const payment = await this.prisma.scoped.payment.findFirst({ where: { id: paymentId }, include: { booking: true } });
    if (!payment || payment.booking.customerId !== customerId) throw new NotFoundException('الدفعة غير موجودة');
    if (Number(data.amount) * 100 !== Number(payment.amount)) throw new BadRequestException('المبلغ لا يطابق المستحق');

    const s = await this.bookingSettings();
    await this.prisma.$transaction(async (tx) => {
      await tx.bankTransferSubmission.create({
        data: {
          tenantId, paymentId, bankAccountId: data.bankAccountId, senderName: data.senderName, senderBank: data.senderBank,
          transferReference: data.transferReference ?? null, transferredAt: new Date(data.transferredAt),
          amount: BigInt(Math.round(data.amount * 100)), receiptKey: data.receiptKey, status: 'submitted',
        },
      });
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'under_review' } });
      await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'awaiting_transfer_review', holdExpiresAt: new Date(Date.now() + s.reviewHoursTransfer * 3_600_000) } });
    });
    await this.notifyRole('payment.transfer_submitted', 'finance', `إيصال تحويل جديد للحجز ${payment.booking.number}`);
    return { ok: true };
  }

  async reviewTransfer(paymentId: string, approve: boolean, reason: string | undefined, actorId: string) {
    const payment = await this.prisma.scoped.payment.findFirst({ where: { id: paymentId }, include: { booking: true, transfer: true } });
    if (!payment?.transfer) throw new NotFoundException('لا يوجد تحويل للمراجعة');
    if (approve) {
      await this.prisma.scoped.bankTransferSubmission.update({ where: { paymentId }, data: { status: 'approved', reviewedById: actorId, reviewedAt: new Date() } });
      await this.markPaid(paymentId, payment.bookingId);
      await this.notifyBooking('payment.transfer_approved', payment.booking, [{ type: 'customer', id: payment.booking.customerId }], 'تم اعتماد تحويلك', true);
    } else {
      await this.prisma.scoped.bankTransferSubmission.update({ where: { paymentId }, data: { status: 'rejected', rejectionReason: reason ?? null, reviewedById: actorId, reviewedAt: new Date() } });
      await this.prisma.scoped.payment.update({ where: { id: paymentId }, data: { status: 'rejected' } });
      await this.prisma.scoped.booking.update({ where: { id: payment.bookingId }, data: { status: 'pending_payment' } });
      await this.notifyBooking('payment.transfer_rejected', payment.booking, [{ type: 'customer', id: payment.booking.customerId }], `لم يتم اعتماد التحويل: ${reason ?? ''}`, true);
    }
    return { ok: true };
  }

  async refund(paymentId: string, amount: number, reason: string, actorId: string) {
    const payment = await this.prisma.scoped.payment.findFirst({ where: { id: paymentId } });
    if (!payment || payment.status !== 'paid') throw new BadRequestException('لا يمكن استرداد هذه الدفعة');
    if (payment.method === 'moyasar' && payment.providerPaymentId) {
      await this.integrations.call('payments.moyasar', 'refund', (ctx) => moyasarRefund(ctx as unknown as MoyasarCtx, payment.providerPaymentId!, BigInt(Math.round(amount * 100))));
    }
    const refunded = BigInt(Math.round(amount * 100));
    const full = refunded >= payment.amount;
    await this.prisma.scoped.payment.update({ where: { id: paymentId }, data: { status: full ? 'refunded' : 'partially_refunded', refundedAmount: { increment: refunded } } });
    await this.audit.record({ actorType: 'staff', actorId, action: 'payment.refund', entityType: 'Payment', entityId: paymentId, after: { amount, reason } });
    return { ok: true };
  }

  // ───────────────── Admin transitions ─────────────────
  async adminConfirm(bookingId: string, actorId: string) {
    const tenantId = this.tenant.requireTenantId();
    await this.prisma.$transaction((tx) => this.confirmInTx(tx, tenantId, bookingId));
    await this.audit.record({ actorType: 'staff', actorId, action: 'booking.confirmed', entityType: 'Booking', entityId: bookingId });
    const booking = await this.prisma.scoped.booking.findFirst({ where: { id: bookingId }, include: { property: true } });
    if (booking) this.notifyBooking('booking.confirmed', booking, [{ type: 'customer', id: booking.customerId }], `تم تأكيد حجز ${booking.property.title}`, true);
    return { ok: true };
  }

  async adminComplete(bookingId: string, actorId: string) {
    const tenantId = this.tenant.requireTenantId();
    await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({ where: { id: bookingId }, data: { status: 'completed', completedAt: new Date() } });
      const property = await tx.property.findFirst({ where: { id: booking.propertyId, tenantId } });
      if (property) {
        const to = booking.offerSnapshot === 'rent' ? 'rented' : 'sold';
        await tx.property.update({ where: { id: property.id }, data: { status: to } });
        await tx.propertyStatusHistory.create({ data: { tenantId, propertyId: property.id, from: property.status, to, reason: 'booking_completed', bookingId, actorType: 'staff', actorId } });
      }
    });
    await this.audit.record({ actorType: 'staff', actorId, action: 'booking.completed', entityType: 'Booking', entityId: bookingId });
    return { ok: true };
  }

  async adminCancel(bookingId: string, reason: string, actorId: string) {
    const tenantId = this.tenant.requireTenantId();
    await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason } });
      const property = await tx.property.findFirst({ where: { id: booking.propertyId, tenantId } });
      if (property && property.status === 'reserved') {
        await tx.property.update({ where: { id: property.id }, data: { status: 'available' } });
        await tx.propertyStatusHistory.create({ data: { tenantId, propertyId: property.id, from: 'reserved', to: 'available', reason: 'booking_cancelled', bookingId, actorType: 'staff', actorId } });
      }
    });
    const booking = await this.prisma.scoped.booking.findFirst({ where: { id: bookingId } });
    if (booking) this.notifyBooking('booking.cancelled', booking, [{ type: 'customer', id: booking.customerId }], `تم إلغاء الحجز ${booking.number}`, true);
    await this.audit.record({ actorType: 'staff', actorId, action: 'booking.cancelled', entityType: 'Booking', entityId: bookingId, after: { reason } });
    return { ok: true };
  }

  async extendHold(bookingId: string, minutes: number) {
    await this.prisma.scoped.booking.update({ where: { id: bookingId }, data: { holdExpiresAt: new Date(Date.now() + minutes * 60_000) } });
    return { ok: true };
  }

  /** وظيفة دورية: تحرير الحجوزات منتهية المهلة (تُجدوَل في العامل الخلفي). */
  async releaseExpiredHolds(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.scoped.booking.findMany({ where: { status: 'pending_payment', holdExpiresAt: { lt: now } }, select: { id: true, customerId: true, number: true } });
    for (const b of expired) {
      await this.prisma.scoped.booking.update({ where: { id: b.id }, data: { status: 'expired' } });
      this.notifyBooking('booking.expired', b, [{ type: 'customer', id: b.customerId }], `انتهت مهلة الحجز ${b.number}`, true);
    }
    return expired.length;
  }

  async meVerify(paymentId: string, customerId: string) {
    const p = await this.prisma.scoped.payment.findFirst({ where: { id: paymentId }, include: { booking: true } });
    if (!p || p.booking.customerId !== customerId) throw new NotFoundException('الدفعة غير موجودة');
    return this.reconcile(paymentId);
  }

  async meCancel(bookingId: string, customerId: string) {
    const b = await this.prisma.scoped.booking.findFirst({ where: { id: bookingId, customerId } });
    if (!b) throw new NotFoundException('الحجز غير موجود');
    if (b.status !== 'pending_payment' && b.status !== 'awaiting_transfer_review') {
      throw new BadRequestException('لا يمكن إلغاء هذا الحجز في حالته الحالية');
    }
    return this.adminCancel(bookingId, 'إلغاء من العميل', customerId);
  }

  // ───────────────── customer / admin reads ─────────────────
  meList(customerId: string) {
    return this.prisma.scoped.booking.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, include: { property: { select: { id: true, title: true, code: true } }, payments: true } });
  }
  async meGet(customerId: string, id: string) {
    const b = await this.prisma.scoped.booking.findFirst({ where: { id, customerId }, include: { property: true, payments: { include: { transfer: true } } } });
    if (!b) throw new NotFoundException('الحجز غير موجود');
    return b;
  }
  adminList(query: Record<string, unknown>) {
    const where: Prisma.BookingWhereInput = {};
    if (typeof query.status === 'string') where.status = query.status as never;
    return this.prisma.scoped.booking.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { property: { select: { title: true, code: true } }, customer: { select: { name: true, phone: true } }, payments: true } });
  }
  async adminGet(id: string) {
    const b = await this.prisma.scoped.booking.findFirst({ where: { id }, include: { property: true, customer: true, payments: { include: { transfer: true, events: true } } } });
    if (!b) throw new NotFoundException('الحجز غير موجود');
    return b;
  }

  // ───────────────── notifications helpers ─────────────────
  private notifyBooking(eventKey: string, booking: { id: string; number: string }, recipients: { type: 'staff' | 'customer'; id: string }[], title: string, email = false) {
    return this.notifications.notify({
      eventKey, recipients, title, body: '', link: `/account/booking.html#b-${booking.id}`, data: { id: booking.id },
      email: email ? { subject: title, html: `<div dir="rtl">${title}</div>`, text: title } : undefined,
    });
  }
  private async notifyRole(eventKey: string, roleKey: string, title: string) {
    const tenantId = this.tenant.requireTenantId();
    const staff = await this.prisma.staffUser.findMany({ where: { tenantId, isActive: true, role: { key: roleKey } }, select: { id: true } });
    await this.notifications.notify({ eventKey, recipients: staff.map((s) => ({ type: 'staff' as const, id: s.id })), title, body: '', email: { subject: title, html: title, text: title } });
  }
  private async notifyAnomaly(number: string) {
    const tenantId = this.tenant.requireTenantId();
    const staff = await this.prisma.staffUser.findMany({ where: { tenantId, isActive: true, role: { key: { in: ['finance', 'owner'] } } }, select: { id: true } });
    await this.notifications.notify({ eventKey: 'payment.anomaly', recipients: staff.map((s) => ({ type: 'staff' as const, id: s.id })), title: `تنبيه: مبلغ دفع غير مطابق ${number}`, body: '', priority: 'high' });
  }

  /** webhook من Moyasar: يحدّد المشترك من الحمولة ويُشغّل المطابقة في سياقه (idempotent). */
  async handleMoyasarWebhook(body: Record<string, unknown>): Promise<void> {
    const data = (body.data ?? {}) as { id?: string; metadata?: { paymentId?: string } };
    const paymentId = data.metadata?.paymentId;
    if (!paymentId) return;
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { tenantId: true } });
    if (!payment) return;
    const externalId = data.id ?? paymentId;

    await this.tenant.run({ tenantId: payment.tenantId, platform: false }, async () => {
      const ctx = await this.integrations.resolve('payments.moyasar');
      const vr = moyasarVerifyWebhook({ body, headers: {}, secret: (ctx.secrets as { webhookSecret?: string }).webhookSecret });
      const existing = await this.prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'moyasar', externalId } } });
      if (existing?.processedAt) return;
      await this.prisma.webhookEvent.upsert({
        where: { provider_externalId: { provider: 'moyasar', externalId } },
        create: { tenantId: payment.tenantId, provider: 'moyasar', externalId, type: vr.type, payload: body as Prisma.InputJsonValue, signatureValid: vr.valid },
        update: {},
      });
      if (!vr.valid) return;
      await this.reconcile(paymentId);
      await this.prisma.webhookEvent.update({ where: { provider_externalId: { provider: 'moyasar', externalId } }, data: { processedAt: new Date() } });
    });
  }

  async assertStaffCanRefund(user: { role?: string; perms?: string[] }) {
    if (!user.perms?.includes('payments.refund')) throw new ForbiddenException('لا تملك صلاحية الاسترداد');
  }
}
