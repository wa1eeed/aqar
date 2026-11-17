import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Booking, Payment, PaymentMethod, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { nextCounter } from '../../common/counter';
import { AppException } from '../../common/errors/app-exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingTransitions, type PendingEvent } from '../bookings/booking-transitions';
import { IntegrationsGateway } from '../integrations/gateway.service';
import type { ProviderPayment } from '../integrations/providers/moyasar';
import { IntegrationError } from '../integrations/types';
import { SettingsService } from '../settings/settings.service';

export type NextAction =
  | { type: 'redirect'; url: string }
  | {
      type: 'moyasar_form';
      publishableKey: string;
      amount: number;
      currency: 'SAR';
      description: string;
      callbackUrl: string;
      methods: string[];
      metadata: Record<string, string>;
    }
  | {
      type: 'bank_transfer';
      amount: number;
      reference: string;
      deadline: string;
      accounts: Array<{
        id: string;
        bankName: string;
        beneficiaryName: string;
        iban: string;
        accountNumber: string | null;
        swift: string | null;
      }>;
      instructionsHtml: string;
      nextSteps: string[];
      referenceHintAr: string;
      acceptedFileTypes: string[];
      maxFileMb: number;
    };

const PAID_STATES = ['paid', 'partially_refunded', 'refunded'] as const;

/**
 * Payments (docs/04 §5–8). The server is the authority: a payment becomes `paid` only after the
 * provider confirms it on a server-to-server fetch with the same amount, currency and our payment id
 * in the metadata — never because a browser or a webhook body says so. Reconciliation is idempotent
 * (row lock + status check) so webhook, callback and the periodic job can race safely.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntegrationsGateway,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly transitions: BookingTransitions,
    private readonly events: EventEmitter2,
    @Inject(ENV) private readonly env: Env,
  ) {}

  emitAll(events: PendingEvent[]): void {
    for (const [key, payload] of events) this.events.emit(key, payload);
  }

  /** Customer return page (query string survives provider redirects; docs/QUESTIONS #43). */
  returnUrl(booking: Pick<Booking, 'id'>, payment: Pick<Payment, 'id'>): string {
    return `${this.env.PUBLIC_URL}/account/booking?b=${encodeURIComponent(booking.id)}&p=${encodeURIComponent(payment.id)}`;
  }

  /** Bank accounts shown to customers: the ordered selection in settings, else all active ones. */
  async transferAccounts() {
    const s = await this.settings.get('bank_transfer');
    const rows = await this.prisma.bankAccount.findMany({
      where: { isActive: true, ...(s.bankAccountIds.length ? { id: { in: s.bankAccountIds } } : {}) },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, bankName: true, beneficiaryName: true, iban: true, accountNumber: true, swift: true },
    });
    if (!s.bankAccountIds.length) return rows;
    const order = new Map(s.bankAccountIds.map((id, i) => [id, i]));
    return rows.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  }

  /** Is each method usable right now (integration enabled, credentials present, circuit closed)? */
  async readyMethods(): Promise<Record<PaymentMethod, boolean>> {
    const [moyasar, accounts, rize] = await Promise.all([
      this.gateway.payments().moyasarReady(),
      this.transferAccounts(),
      this.gateway.payments().rizeReady(),
    ]);
    return { moyasar: moyasar.ready, bank_transfer: accounts.length > 0, rize };
  }

  /** Creates the payment row for a booking (inside the booking transaction). */
  async createPaymentRow(tx: Prisma.TransactionClient, booking: Booking, method: PaymentMethod): Promise<Payment> {
    const p = await tx.payment.create({
      data: {
        bookingId: booking.id,
        method,
        amount: booking.amountDue,
        idempotencyKey: `pay_${randomBytes(16).toString('hex')}`,
        status: method === 'bank_transfer' ? 'pending' : 'initiated',
      },
    });
    await tx.paymentEvent.create({ data: { paymentId: p.id, type: 'created', payload: { method } } });
    await this.audit.record(
      {
        action: 'payment.create',
        entityType: 'payment',
        entityId: p.id,
        after: { bookingId: booking.id, method, amount: p.amount.toString() },
      },
      tx,
    );
    return p;
  }

  /**
   * Starts the provider side and returns what the browser must do next (docs/04 §3.6). A provider
   * failure leaves the booking on hold so the customer can retry («إعادة المحاولة»).
   */
  async start(booking: Booking & { property: { title: string } }, payment: Payment): Promise<NextAction> {
    if (payment.method === 'bank_transfer') {
      const [s, accounts] = await Promise.all([this.settings.get('bank_transfer'), this.transferAccounts()]);
      return {
        type: 'bank_transfer',
        amount: Number(payment.amount),
        reference: booking.number,
        deadline: booking.holdExpiresAt.toISOString(),
        accounts,
        instructionsHtml: s.instructionsHtml,
        nextSteps: s.nextSteps,
        referenceHintAr: s.referenceHintAr,
        acceptedFileTypes: s.acceptedFileTypes,
        maxFileMb: s.maxFileMb,
      };
    }
    if (payment.method === 'rize') {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 502, 'التقسيط عبر رايز غير متاح حالياً');
    }
    const metadata = { bookingId: booking.id, paymentId: payment.id, bookingNumber: booking.number };
    const description = `حجز ${booking.number} — ${booking.property.title}`.slice(0, 200);
    const ready = await this.gateway.payments().moyasarReady();
    if (!ready.ready) throw new AppException('INTEGRATION_NOT_CONFIGURED', 502, 'الدفع الإلكتروني غير متاح حالياً');
    const back = this.returnUrl(booking, payment);
    if (ready.mode === 'embedded_form' && ready.publishableKey) {
      const sources = (await this.settings.get('payments')).moyasar.sources;
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'pending' } });
      return {
        type: 'moyasar_form',
        publishableKey: ready.publishableKey,
        amount: Number(payment.amount),
        currency: 'SAR',
        description,
        callbackUrl: back,
        methods: sources,
        metadata,
      };
    }
    try {
      const inv = await this.gateway.payments().createInvoice({
        amount: payment.amount,
        descriptionAr: description,
        successUrl: back,
        backUrl: back,
        callbackUrl: `${this.env.PUBLIC_URL}/api/v1/webhooks/moyasar`,
        metadata,
      });
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'pending', providerInvoiceId: inv.invoiceId, providerUrl: inv.url },
        }),
        this.prisma.paymentEvent.create({
          data: { paymentId: payment.id, type: 'redirected', payload: { invoiceId: inv.invoiceId } },
        }),
      ]);
      return { type: 'redirect', url: inv.url };
    } catch (e) {
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', failureReason: 'PROVIDER_ERROR' },
        }),
        this.prisma.paymentEvent.create({
          data: {
            paymentId: payment.id,
            type: 'failed',
            payload: { code: e instanceof IntegrationError ? e.code : 'ERROR' },
          },
        }),
      ]);
      throw new AppException('INTEGRATION_ERROR', 502, 'تعذّر الاتصال ببوابة الدفع، حاول مرة أخرى');
    }
  }

  // ───────────── reconciliation (docs/04 §5) ─────────────

  /**
   * Re-fetches the payment from the provider and applies the result once. `hintPaymentId` is the
   * Moyasar payment id from the embedded form's redirect; it is accepted only if the provider's
   * metadata names this payment.
   */
  async reconcile(paymentId: string, opts: { hintPaymentId?: string; source: string } = { source: 'manual' }) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppException('NOT_FOUND', 404, 'الدفعة غير موجودة');
    if (payment.method !== 'moyasar' || (PAID_STATES as readonly string[]).includes(payment.status)) {
      return { status: payment.status };
    }
    const providerId = payment.providerInvoiceId ?? payment.providerPaymentId ?? opts.hintPaymentId;
    if (!providerId) return { status: payment.status };
    let result: ProviderPayment;
    try {
      result = payment.providerInvoiceId
        ? await this.gateway.payments().fetchInvoice(payment.providerInvoiceId)
        : await this.gateway.payments().fetchPayment(payment.providerPaymentId ?? opts.hintPaymentId!);
    } catch (e) {
      this.logger.warn({ paymentId, err: e instanceof Error ? e.message : e }, 'reconcile fetch failed');
      return { status: payment.status };
    }
    const events: PendingEvent[] = [];
    const status = await this.prisma.$transaction(async (tx) => {
      // Row lock: the webhook, the callback and the job may run at the same moment.
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (
        (PAID_STATES as readonly string[]).includes(p.status) ||
        (p.status === 'failed' && p.failureReason === 'AMOUNT_MISMATCH')
      ) {
        return p.status;
      }
      await tx.paymentEvent.create({
        data: {
          paymentId,
          type: 'verified',
          payload: { source: opts.source, ...result.summary, status: result.status } as Prisma.InputJsonValue,
        },
      });
      if (result.status === 'pending') return p.status;
      if (result.status === 'failed') {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'failed', failureReason: 'DECLINED', providerStatus: 'failed' },
        });
        await this.audit.record(
          { action: 'payment.failed', entityType: 'payment', entityId: paymentId, after: { source: opts.source } },
          tx,
        );
        events.push(['payment.failed', { paymentId }]);
        return 'failed';
      }
      const matches = result.amount === p.amount && result.currency === 'SAR' && result.metadata.paymentId === p.id;
      if (result.status !== 'paid' || !matches) {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'failed',
            failureReason: 'AMOUNT_MISMATCH',
            providerPaymentId: result.paymentId ?? p.providerPaymentId,
          },
        });
        await this.audit.record(
          {
            action: 'payment.anomaly',
            entityType: 'payment',
            entityId: paymentId,
            after: {
              expected: p.amount.toString(),
              received: result.amount.toString(),
              currency: result.currency,
              metadataMatch: result.metadata.paymentId === p.id,
            },
          },
          tx,
        );
        events.push(['payment.anomaly', { paymentId, reason: 'AMOUNT_MISMATCH' }]);
        return 'failed';
      }
      events.push(...(await this.markPaid(tx, p, { providerPaymentId: result.paymentId, source: opts.source })));
      return 'paid';
    });
    this.emitAll(events);
    return { status };
  }

  /**
   * paid → receipt number, booking.amountPaid += amount, auto-confirm when fully paid. A payment that
   * arrives for a booking that is no longer active is kept (money was received) and raised as an
   * anomaly for finance to refund.
   */
  async markPaid(
    tx: Prisma.TransactionClient,
    p: Payment,
    opts: { providerPaymentId?: string | null; source: string; actor?: { type: 'staff'; id: string } },
  ): Promise<PendingEvent[]> {
    const events: PendingEvent[] = [];
    const year = new Date().getUTCFullYear();
    const prefix = (await this.settings.get('payments')).receiptPrefix;
    const receiptNumber = `${prefix}-${year}-${String(await nextCounter(tx, `receipt:${year}`)).padStart(6, '0')}`;
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        receiptNumber,
        providerStatus: 'paid',
        ...(opts.providerPaymentId ? { providerPaymentId: opts.providerPaymentId } : {}),
      },
    });
    await tx.paymentEvent.create({
      data: { paymentId: p.id, type: 'paid', payload: { source: opts.source, receiptNumber } },
    });
    await this.audit.record(
      {
        action: 'payment.paid',
        entityType: 'payment',
        entityId: p.id,
        after: { amount: p.amount.toString(), receiptNumber, source: opts.source },
        ...(opts.actor ? { actor: opts.actor } : {}),
      },
      tx,
    );
    const booking = await tx.booking.update({
      where: { id: p.bookingId },
      data: { amountPaid: { increment: p.amount } },
    });
    events.push(['payment.paid', { paymentId: p.id }]);
    if (booking.status === 'pending_payment' || booking.status === 'awaiting_transfer_review') {
      const auto = (await this.settings.get('booking')).autoConfirmWhenPaid;
      if (booking.amountPaid >= booking.amountDue && (auto || opts.actor)) {
        events.push(
          ...(await this.transitions.apply(tx, booking, 'confirmed', {
            actor: opts.actor ?? { type: 'system', id: null },
          })),
        );
      }
    } else if (booking.status !== 'confirmed') {
      events.push(['payment.anomaly', { paymentId: p.id, reason: 'BOOKING_NOT_ACTIVE' }]);
    }
    events.push(['payment.updated', { paymentId: p.id }]);
    return events;
  }

  /** Pending Moyasar payments younger than 24 h (job every 5 minutes, docs/04 §5). */
  async reconcilePending(): Promise<number> {
    const rows = await this.prisma.payment.findMany({
      where: {
        method: 'moyasar',
        status: { in: ['initiated', 'pending'] },
        createdAt: { gt: new Date(Date.now() - 24 * 3600_000) },
        OR: [{ providerInvoiceId: { not: null } }, { providerPaymentId: { not: null } }],
      },
      select: { id: true },
      take: 200,
    });
    for (const r of rows) await this.reconcile(r.id, { source: 'job' });
    return rows.length;
  }

  // ───────────── refunds (docs/04 §5, §6) ─────────────

  async refund(staffId: string, paymentId: string, amount: bigint, reason: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
    if (!p) throw new AppException('NOT_FOUND', 404, 'الدفعة غير موجودة');
    if (p.status !== 'paid' && p.status !== 'partially_refunded') {
      throw new AppException('PAYMENT_NOT_REFUNDABLE', 422, 'لا يمكن استرداد هذه الدفعة');
    }
    const refundable = p.amount - p.refundedAmount;
    if (amount <= 0n || amount > refundable) {
      throw new AppException('VALIDATION_FAILED', 400, 'مبلغ الاسترداد غير صحيح', {
        fields: { amount: 'exceeds_refundable' },
      });
    }
    if (p.booking.status === 'pending_payment' || p.booking.status === 'awaiting_transfer_review') {
      throw new AppException('PAYMENT_NOT_REFUNDABLE', 422, 'ألغِ الحجز أولاً ثم استرد المبلغ');
    }
    // Card payments are refunded at Moyasar; bank transfers are refunded by the finance team manually
    // and recorded here.
    let providerStatus: string | null = null;
    if (p.method === 'moyasar') {
      if (!p.providerPaymentId)
        throw new AppException('PAYMENT_NOT_REFUNDABLE', 422, 'لا يوجد رقم عملية لدى بوابة الدفع');
      try {
        providerStatus = (await this.gateway.payments().refund(p.providerPaymentId, amount)).status;
      } catch {
        throw new AppException('INTEGRATION_ERROR', 502, 'تعذّر تنفيذ الاسترداد لدى بوابة الدفع');
      }
    }
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
      const cur = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const refunded = cur.refundedAmount + amount;
      const full = refunded >= cur.amount;
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedAmount: refunded,
          status: full ? 'refunded' : 'partially_refunded',
          ...(providerStatus ? { providerStatus } : {}),
        },
      });
      await tx.paymentEvent.create({
        data: { paymentId, type: 'refunded', payload: { amount: amount.toString(), reason, method: cur.method } },
      });
      await this.audit.record(
        {
          action: 'payment.refund',
          entityType: 'payment',
          entityId: paymentId,
          after: { amount: amount.toString(), reason, full },
        },
        tx,
      );
      const booking = await tx.booking.update({
        where: { id: cur.bookingId },
        data: { amountPaid: { decrement: amount } },
      });
      if (booking.status === 'cancelled' && booking.amountPaid <= 0n) {
        events.push(
          ...(await this.transitions.apply(tx, booking, 'refunded', { actor: { type: 'staff', id: staffId }, reason })),
        );
      }
      events.push(['payment.refunded', { paymentId, amount: amount.toString() }], ['payment.updated', { paymentId }]);
    });
    this.emitAll(events);
    return this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }
}
