import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { PUBLIC_CACHE_VERSION } from '../properties/properties.service';
import type { NotificationEmail } from '../email/templates';
import { RealtimeService, rooms } from '../realtime/realtime.service';
import { sarLabel } from './format';
import { NotificationsService, type Recipient } from './notifications.service';

const customer = (id: string): Recipient => ({ type: 'customer', id });
const staff = (id: string): Recipient => ({ type: 'staff', id });
const METHOD: Record<string, string> = { moyasar: 'الدفع الإلكتروني', bank_transfer: 'تحويل بنكي', rize: 'رايز' };
const TYPE: Record<string, string> = { deposit: 'عربون', full: 'دفع كامل' };

/**
 * Booking and payment notifications (docs/06 §3) and their live pushes (`booking.updated`,
 * `payment.updated`, docs/02 §9). Titles are the catalog's Arabic strings.
 */
@Injectable()
export class BookingRules {
  private readonly logger = new Logger(BookingRules.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private async safe(event: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.error({ err: e, event }, 'booking notification failed');
    }
  }

  private load(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        property: { select: { id: true, title: true, code: true, agentId: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
    });
  }

  private accountUrl(bookingId: string) {
    return `${this.env.PUBLIC_URL}/account/booking?b=${encodeURIComponent(bookingId)}`;
  }

  private customerLink(bookingId: string) {
    return `/account/booking?b=${encodeURIComponent(bookingId)}`;
  }

  /** Finance team (payments.view with unrestricted scope). */
  private finance() {
    return this.notifications.staffWith('payments.view', { scopeAll: true });
  }

  private email(
    subject: string,
    intro: string,
    details: Array<[string, string]>,
    cta?: { label: string; url: string },
  ): NotificationEmail {
    return { subject, title: subject, intro, details, ...(cta ? { cta } : {}) };
  }

  // ───────────── bookings ─────────────

  @OnEvent('booking.created', { async: true })
  onCreated(e: { bookingId: string }) {
    return this.safe('booking.created', async () => {
      const b = await this.load(e.bookingId);
      if (!b) return;
      const title = `تم إنشاء الحجز ${b.number}`;
      await this.notifications.dispatch(
        'booking.created',
        [customer(b.customerId)],
        { title, body: b.property.title, link: this.customerLink(b.id) },
        { entityId: b.id },
      );
      const staffRecipients = [
        ...(await this.notifications.staffWith('bookings.view', { scopeAll: true })),
        staff(b.property.agentId),
      ];
      await this.notifications.dispatch(
        'booking.created',
        staffRecipients,
        {
          title,
          body: `${b.customer.name} · ${b.property.title} · ${TYPE[b.paymentType]} ${sarLabel(b.amountDue)}`,
          link: `/admin/bookings/${b.id}`,
        },
        { entityId: b.id },
      );
      // Bank transfer: the instructions also go by email (template transfer-instructions).
      if (b.paymentMethod === 'bank_transfer' && b.customer.email) {
        await this.notifications.emailGuest('booking.created', `${b.id}:instructions`, b.customer.email, {
          template: 'transfer-instructions',
          content: this.email(
            `تعليمات التحويل للحجز ${b.number}`,
            'حوّل المبلغ المستحق إلى أحد حساباتنا البنكية واكتب رقم الحجز في الملاحظات، ثم ارفع الإيصال من صفحة الحجز قبل انتهاء المهلة.',
            [
              ['رقم الحجز (مرجع التحويل)', b.number],
              ['المبلغ المستحق', sarLabel(b.amountDue)],
              ['العقار', b.property.title],
            ],
            { label: 'عرض بيانات التحويل', url: this.accountUrl(b.id) },
          ),
        });
      }
    });
  }

  @OnEvent('booking.confirmed', { async: true })
  onConfirmed(e: { bookingId: string }) {
    return this.safe('booking.confirmed', async () => {
      const b = await this.load(e.bookingId);
      if (!b) return;
      const title = `تم تأكيد حجز ${b.property.title}`;
      const details: Array<[string, string]> = [
        ['رقم الحجز', b.number],
        ['نوع الدفع', TYPE[b.paymentType] ?? b.paymentType],
        ['المدفوع', sarLabel(b.amountPaid)],
      ];
      await this.notifications.dispatch(
        'booking.confirmed',
        [customer(b.customerId)],
        { title, body: `الحجز ${b.number}`, link: this.customerLink(b.id) },
        {
          entityId: b.id,
          email: {
            template: 'booking-confirmed',
            content: this.email(
              title,
              'تم تأكيد حجزك وأصبح العقار محجوزاً باسمك. سيتواصل معك المستشار لإكمال الإجراءات.',
              details,
              {
                label: 'عرض الحجز',
                url: this.accountUrl(b.id),
              },
            ),
          },
        },
      );
      await this.notifications.dispatch(
        'booking.confirmed',
        [staff(b.property.agentId), ...(await this.finance())],
        { title, body: `${b.number} · ${b.customer.name}`, link: `/admin/bookings/${b.id}` },
        {
          entityId: b.id,
          email: { template: 'booking-confirmed', content: this.email(title, 'تم تأكيد حجز جديد.', details) },
        },
      );
    });
  }

  @OnEvent('booking.expired', { async: true })
  onExpired(e: { bookingId: string }) {
    return this.safe('booking.expired', async () => {
      const b = await this.load(e.bookingId);
      if (!b) return;
      const title = `انتهت مهلة الحجز ${b.number}`;
      await this.notifications.dispatch(
        'booking.expired',
        [customer(b.customerId)],
        { title, body: b.property.title, link: this.customerLink(b.id) },
        {
          entityId: b.id,
          email: {
            template: 'booking-expired',
            content: this.email(
              title,
              'انتهت مهلة إتمام الدفع ولم يُحجز العقار. يمكنك إنشاء حجز جديد إن كان العقار ما زال متاحاً.',
              [['العقار', b.property.title]],
            ),
          },
        },
      );
    });
  }

  @OnEvent('booking.cancelled', { async: true })
  onCancelled(e: { bookingId: string; reason?: string | null }) {
    return this.safe('booking.cancelled', async () => {
      const b = await this.load(e.bookingId);
      if (!b) return;
      const title = `تم إلغاء الحجز ${b.number}`;
      const reason = e.reason && e.reason !== 'customer_cancelled' ? e.reason : '';
      await this.notifications.dispatch(
        'booking.cancelled',
        [customer(b.customerId)],
        { title, body: reason || b.property.title, link: this.customerLink(b.id) },
        {
          entityId: b.id,
          email: {
            template: 'booking-cancelled',
            content: this.email(title, 'تم إلغاء الحجز. إن كان هناك مبلغ مدفوع فسيتواصل معك فريقنا بخصوص الاسترداد.', [
              ['العقار', b.property.title],
              ['السبب', reason],
            ]),
          },
        },
      );
      await this.notifications.dispatch(
        'booking.cancelled',
        [staff(b.property.agentId)],
        { title, body: `${b.customer.name}${reason ? ` · ${reason}` : ''}`, link: `/admin/bookings/${b.id}` },
        { entityId: b.id },
      );
    });
  }

  @OnEvent('booking.completed', { async: true })
  onCompleted(e: { bookingId: string }) {
    return this.safe('booking.completed', async () => {
      const b = await this.load(e.bookingId);
      if (!b) return;
      const title = `مبروك! اكتمل حجز ${b.property.title}`;
      await this.notifications.dispatch(
        'booking.completed',
        [customer(b.customerId)],
        { title, body: `الحجز ${b.number}`, link: this.customerLink(b.id) },
        {
          entityId: b.id,
          email: {
            template: 'booking-completed',
            content: this.email(title, 'اكتملت الصفقة بنجاح. شكراً لثقتك بنا.', [['رقم الحجز', b.number]]),
          },
        },
      );
    });
  }

  @OnEvent('booking.updated')
  onBookingUpdated(e: { bookingId: string }) {
    return this.safe('booking.updated', async () => {
      const b = await this.prisma.booking.findUnique({
        where: { id: e.bookingId },
        select: { id: true, number: true, status: true, customerId: true },
      });
      if (!b) return;
      // A booking can change the property's status and its «احجز العقار» availability: refresh public caches.
      await this.redis.incr(PUBLIC_CACHE_VERSION);
      this.realtime.emit([rooms.customer(b.customerId), rooms.staff], 'booking.updated', {
        id: b.id,
        number: b.number,
        status: b.status,
      });
    });
  }

  // ───────────── payments ─────────────

  private loadPayment(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            property: { select: { title: true, agentId: true } },
            customer: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  }

  @OnEvent('payment.paid', { async: true })
  onPaid(e: { paymentId: string }) {
    return this.safe('payment.paid', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const b = p.booking;
      const title = `تم استلام دفعتك ${sarLabel(p.amount)}`;
      await this.notifications.dispatch(
        'payment.paid',
        [customer(b.customerId)],
        { title, body: `الحجز ${b.number} · ${b.property.title}`, link: this.customerLink(b.id) },
        {
          entityId: p.id,
          email: {
            template: 'payment-receipt',
            content: this.email(
              title,
              'استلمنا دفعتك بنجاح. يمكنك تنزيل الإيصال من صفحة الحجز.',
              [
                ['رقم الإيصال', p.receiptNumber ?? ''],
                ['رقم الحجز', b.number],
                ['الطريقة', METHOD[p.method] ?? p.method],
                ['العقار', b.property.title],
              ],
              { label: 'عرض الحجز والإيصال', url: this.accountUrl(b.id) },
            ),
          },
        },
      );
      await this.notifications.dispatch(
        'payment.paid',
        await this.finance(),
        {
          title: `دفعة مستلمة ${sarLabel(p.amount)}`,
          body: `${b.number} · ${b.customer.name} · ${METHOD[p.method]}`,
          link: `/admin/payments?open=${p.id}`,
        },
        { entityId: p.id },
      );
    });
  }

  @OnEvent('payment.failed', { async: true })
  onFailed(e: { paymentId: string }) {
    return this.safe('payment.failed', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const b = p.booking;
      const title = 'لم تكتمل عملية الدفع';
      await this.notifications.dispatch(
        'payment.failed',
        [customer(b.customerId)],
        { title, body: `الحجز ${b.number} — يمكنك المحاولة مرة أخرى قبل انتهاء المهلة`, link: this.customerLink(b.id) },
        {
          entityId: p.id,
          email: {
            template: 'payment-failed',
            content: this.email(
              title,
              'لم تكتمل عملية الدفع. يمكنك إعادة المحاولة من صفحة الحجز قبل انتهاء المهلة.',
              [['رقم الحجز', b.number]],
              {
                label: 'إعادة المحاولة',
                url: this.accountUrl(b.id),
              },
            ),
          },
        },
      );
    });
  }

  @OnEvent('payment.transfer_submitted', { async: true })
  onTransferSubmitted(e: { paymentId: string }) {
    return this.safe('payment.transfer_submitted', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const b = p.booking;
      const title = `إيصال تحويل جديد للحجز ${b.number}`;
      await this.notifications.dispatch(
        'payment.transfer_submitted',
        await this.notifications.staffWith('payments.review', { scopeAll: true }),
        {
          title,
          body: `${b.customer.name} · ${sarLabel(p.amount)}`,
          link: `/admin/payments/transfers?open=${p.id}`,
          priority: 'high',
        },
        {
          entityId: `${p.id}:${Date.now()}`,
          email: {
            template: 'transfer-submitted-staff',
            content: this.email(
              title,
              'رفع العميل إيصال تحويل بنكي بانتظار المراجعة.',
              [
                ['العميل', b.customer.name],
                ['المبلغ', sarLabel(p.amount)],
                ['العقار', b.property.title],
              ],
              { label: 'مراجعة الإيصال', url: `${this.env.PUBLIC_URL}/admin/payments/transfers?open=${p.id}` },
            ),
          },
        },
      );
    });
  }

  @OnEvent('payment.transfer_approved', { async: true })
  onTransferApproved(e: { paymentId: string }) {
    return this.safe('payment.transfer_approved', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const title = 'تم اعتماد تحويلك';
      await this.notifications.dispatch(
        'payment.transfer_approved',
        [customer(p.booking.customerId)],
        { title, body: `الحجز ${p.booking.number}`, link: this.customerLink(p.booking.id) },
        {
          entityId: p.id,
          email: {
            template: 'transfer-approved',
            content: this.email(
              title,
              'راجعنا إيصال التحويل واعتمدناه، وتم تأكيد حجزك.',
              [['رقم الحجز', p.booking.number]],
              {
                label: 'عرض الحجز',
                url: this.accountUrl(p.booking.id),
              },
            ),
          },
        },
      );
    });
  }

  @OnEvent('payment.transfer_rejected', { async: true })
  onTransferRejected(e: { paymentId: string; reason: string }) {
    return this.safe('payment.transfer_rejected', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const title = `لم يتم اعتماد التحويل: ${e.reason}`;
      await this.notifications.dispatch(
        'payment.transfer_rejected',
        [customer(p.booking.customerId)],
        {
          title,
          body: `الحجز ${p.booking.number} — يمكنك رفع إيصال جديد قبل انتهاء المهلة`,
          link: this.customerLink(p.booking.id),
          priority: 'high',
        },
        {
          entityId: `${p.id}:${Date.now()}`,
          email: {
            template: 'transfer-rejected',
            content: this.email(
              'لم يتم اعتماد التحويل',
              `السبب: ${e.reason}. يمكنك رفع إيصال صحيح من صفحة الحجز قبل انتهاء المهلة.`,
              [['رقم الحجز', p.booking.number]],
              { label: 'رفع إيصال جديد', url: this.accountUrl(p.booking.id) },
            ),
          },
        },
      );
    });
  }

  @OnEvent('payment.refunded', { async: true })
  onRefunded(e: { paymentId: string; amount: string }) {
    return this.safe('payment.refunded', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const amount = sarLabel(BigInt(e.amount));
      const title = `تم استرداد ${amount}`;
      await this.notifications.dispatch(
        'payment.refunded',
        [customer(p.booking.customerId)],
        { title, body: `الحجز ${p.booking.number}`, link: this.customerLink(p.booking.id) },
        {
          entityId: `${p.id}:${e.amount}:${p.refundedAmount}`,
          email: {
            template: 'refund',
            content: this.email(
              title,
              p.method === 'moyasar'
                ? 'أُعيد المبلغ إلى وسيلة الدفع، وقد يستغرق ظهوره بضعة أيام عمل حسب البنك.'
                : 'تم تحويل المبلغ المسترد إلى حسابك البنكي.',
              [
                ['رقم الحجز', p.booking.number],
                ['المبلغ المسترد', amount],
              ],
            ),
          },
        },
      );
      await this.notifications.dispatch(
        'payment.refunded',
        await this.finance(),
        { title, body: `${p.booking.number} · ${p.booking.customer.name}`, link: `/admin/payments?open=${p.id}` },
        { entityId: `${p.id}:${e.amount}:${p.refundedAmount}` },
      );
    });
  }

  @OnEvent('payment.anomaly', { async: true })
  onAnomaly(e: { paymentId: string; reason: string }) {
    return this.safe('payment.anomaly', async () => {
      const p = await this.loadPayment(e.paymentId);
      if (!p) return;
      const title = `تنبيه: مبلغ دفع غير مطابق ${p.booking.number}`;
      const why =
        e.reason === 'BOOKING_NOT_ACTIVE'
          ? 'وصلت دفعة لحجز غير نشط (منتهٍ أو ملغى) — يلزم الاسترداد'
          : 'المبلغ أو العملة أو بيانات الدفعة لا تطابق المتوقع';
      const owners = await this.notifications.staffWith('payments.view', { roleKeys: ['owner'] });
      await this.notifications.dispatch(
        'payment.anomaly',
        [...(await this.finance()), ...owners],
        { title, body: why, link: `/admin/payments?open=${p.id}`, priority: 'high' },
        {
          entityId: `${p.id}:${e.reason}`,
          email: {
            template: 'payment-failed',
            content: this.email(
              title,
              why,
              [
                ['رقم الحجز', p.booking.number],
                ['المبلغ المتوقع', sarLabel(p.amount)],
              ],
              { label: 'فتح الدفعة', url: `${this.env.PUBLIC_URL}/admin/payments?open=${p.id}` },
            ),
          },
        },
      );
    });
  }

  @OnEvent('payment.updated')
  onPaymentUpdated(e: { paymentId: string }) {
    return this.safe('payment.updated', async () => {
      const p = await this.prisma.payment.findUnique({
        where: { id: e.paymentId },
        select: { id: true, status: true, bookingId: true, booking: { select: { customerId: true } } },
      });
      if (!p) return;
      this.realtime.emit([rooms.customer(p.booking.customerId), rooms.staff], 'payment.updated', {
        id: p.id,
        bookingId: p.bookingId,
        status: p.status,
      });
    });
  }
}
