import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { BookingTransitions, type PendingEvent } from '../bookings/booking-transitions';
import { SettingsService } from '../settings/settings.service';
import { FileStore } from './file-store.service';
import { PaymentsService } from './payments.service';

/** File signatures — the declared content type is never trusted (docs/10 §1 uploads). */
const SIGNATURES: Array<{ type: string; ext: string; test: (b: Buffer) => boolean }> = [
  { type: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export function detectFileType(buf: Buffer): { type: string; ext: string } | null {
  const s = SIGNATURES.find((x) => x.test(buf));
  return s ? { type: s.type, ext: s.ext } : null;
}

export interface TransferInput {
  bankAccountId: string;
  senderName: string;
  senderBank: string;
  transferReference?: string | null;
  transferredAt: string;
  /** SAR as typed by the customer; must equal the amount due. */
  amount: number;
}

/**
 * Bank transfer receipts (docs/04 §6): customer upload into private storage, review by staff with
 * `payments.review`, approve → paid + booking confirmed, reject → reason, customer may upload again
 * until the hold expires.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileStore,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly transitions: BookingTransitions,
    private readonly payments: PaymentsService,
  ) {}

  async submit(
    user: AuthUser,
    paymentId: string,
    input: TransferInput,
    file: { buffer: Buffer; size: number } | undefined,
  ) {
    const p = await this.prisma.payment.findFirst({
      where: { id: paymentId, booking: { customerId: user.id } },
      include: { booking: true, transfer: true },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'الدفعة غير موجودة');
    if (p.method !== 'bank_transfer' || !['pending', 'rejected'].includes(p.status)) {
      throw new AppException('TRANSFER_NOT_ALLOWED', 422, 'لا يمكن رفع إيصال لهذه الدفعة');
    }
    if (p.booking.status !== 'pending_payment' || p.booking.holdExpiresAt < new Date()) {
      throw new AppException('BOOKING_HOLD_EXPIRED', 422, 'انتهت مهلة الحجز');
    }
    const s = await this.settings.get('bank_transfer');
    const account = await this.prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, isActive: true } });
    if (!account) {
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { bankAccountId: 'invalid_account' },
      });
    }
    const amount = BigInt(Math.round(input.amount * 100));
    if (amount !== p.amount) {
      throw new AppException('VALIDATION_FAILED', 400, 'المبلغ المحوّل يجب أن يساوي المبلغ المستحق', {
        fields: { amount: 'amount_mismatch' },
      });
    }
    const transferredAt = new Date(input.transferredAt);
    const earliest = new Date(p.createdAt.getTime() - 7 * 86_400_000);
    const latest = new Date(Date.now() + 86_400_000);
    if (Number.isNaN(transferredAt.getTime()) || transferredAt < earliest || transferredAt > latest) {
      throw new AppException('VALIDATION_FAILED', 400, 'تاريخ التحويل غير صحيح', {
        fields: { transferredAt: 'invalid_date' },
      });
    }
    let receiptKey: string | null = p.transfer?.receiptKey ?? null;
    if (file) {
      if (file.size > s.maxFileMb * 1024 * 1024) {
        throw new AppException('VALIDATION_FAILED', 400, `حجم الإيصال أكبر من ${s.maxFileMb} ميجابايت`, {
          fields: { receipt: 'too_large' },
        });
      }
      const kind = detectFileType(file.buffer);
      if (!kind || !(s.acceptedFileTypes as readonly string[]).includes(kind.type)) {
        throw new AppException('VALIDATION_FAILED', 400, 'نوع الملف غير مقبول (PDF أو JPG أو PNG)', {
          fields: { receipt: 'invalid_type' },
        });
      }
      receiptKey = `uploads/transfers/${p.id}/${randomBytes(12).toString('hex')}.${kind.ext}`;
      await this.files.put(receiptKey, file.buffer, kind.type);
    }
    if (!receiptKey && s.requireReceipt) {
      throw new AppException('VALIDATION_FAILED', 400, 'إيصال التحويل مطلوب', { fields: { receipt: 'Required' } });
    }

    const reviewHours = (await this.settings.get('booking')).reviewHoursTransfer;
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      const data = {
        bankAccountId: account.id,
        senderName: input.senderName,
        senderBank: input.senderBank,
        transferReference: input.transferReference || null,
        transferredAt,
        amount,
        receiptKey: receiptKey ?? '',
        status: 'submitted' as const,
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      };
      await tx.bankTransferSubmission.upsert({
        where: { paymentId: p.id },
        create: { paymentId: p.id, ...data },
        update: data,
      });
      await tx.payment.update({ where: { id: p.id }, data: { status: 'under_review' } });
      await tx.paymentEvent.create({
        data: { paymentId: p.id, type: 'transfer_submitted', payload: { bankAccountId: account.id } },
      });
      // The admin review time extends the hold (docs/04 §4).
      const reviewUntil = new Date(Date.now() + reviewHours * 3_600_000);
      await tx.booking.update({
        where: { id: p.bookingId },
        data: { holdExpiresAt: reviewUntil > p.booking.holdExpiresAt ? reviewUntil : p.booking.holdExpiresAt },
      });
      events.push(
        ...(await this.transitions.apply(tx, p.booking, 'awaiting_transfer_review', {
          actor: { type: 'customer', id: user.id },
        })),
      );
      await this.audit.record(
        {
          action: 'payment.transfer_submitted',
          entityType: 'payment',
          entityId: p.id,
          after: { amount: amount.toString(), bankAccountId: account.id },
        },
        tx,
      );
      events.push(['payment.transfer_submitted', { paymentId: p.id }], ['payment.updated', { paymentId: p.id }]);
    });
    this.payments.emitAll(events);
    return { status: 'under_review' };
  }

  async approve(staffId: string, paymentId: string) {
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
      const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { transfer: true, booking: true } });
      if (!p?.transfer) throw new AppException('NOT_FOUND', 404, 'لا يوجد إيصال لهذه الدفعة');
      if (p.transfer.status !== 'submitted' || p.status !== 'under_review') {
        throw new AppException('TRANSFER_ALREADY_REVIEWED', 409, 'تمت مراجعة هذا الإيصال');
      }
      if (p.booking.status !== 'awaiting_transfer_review') {
        throw new AppException('BOOKING_INVALID_TRANSITION', 422, 'لا يمكن اعتماد التحويل في حالة الحجز الحالية');
      }
      await tx.bankTransferSubmission.update({
        where: { paymentId },
        data: { status: 'approved', reviewedById: staffId, reviewedAt: new Date() },
      });
      await tx.paymentEvent.create({ data: { paymentId, type: 'transfer_approved', payload: { by: staffId } } });
      events.push(['payment.transfer_approved', { paymentId }]);
      events.push(
        ...(await this.payments.markPaid(tx, p, { source: 'transfer_review', actor: { type: 'staff', id: staffId } })),
      );
    });
    this.payments.emitAll(events);
  }

  async reject(staffId: string, paymentId: string, reason: string) {
    const events: PendingEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
      const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { transfer: true, booking: true } });
      if (!p?.transfer) throw new AppException('NOT_FOUND', 404, 'لا يوجد إيصال لهذه الدفعة');
      if (p.transfer.status !== 'submitted' || p.status !== 'under_review') {
        throw new AppException('TRANSFER_ALREADY_REVIEWED', 409, 'تمت مراجعة هذا الإيصال');
      }
      await tx.bankTransferSubmission.update({
        where: { paymentId },
        data: { status: 'rejected', reviewedById: staffId, reviewedAt: new Date(), rejectionReason: reason },
      });
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'rejected' } });
      await tx.paymentEvent.create({ data: { paymentId, type: 'transfer_rejected', payload: { reason } } });
      await this.audit.record(
        {
          action: 'payment.transfer_rejected',
          entityType: 'payment',
          entityId: paymentId,
          after: { reason },
          actor: { type: 'staff', id: staffId },
        },
        tx,
      );
      if (p.booking.status === 'awaiting_transfer_review') {
        events.push(
          ...(await this.transitions.apply(tx, p.booking, 'pending_payment', {
            actor: { type: 'staff', id: staffId },
            reason,
          })),
        );
      }
      events.push(['payment.transfer_rejected', { paymentId, reason }], ['payment.updated', { paymentId }]);
    });
    this.payments.emitAll(events);
  }

  /** Receipt file for reviewers (streamed through the API after the permission check). */
  async receiptFile(paymentId: string): Promise<{ body: Buffer; type: string; ext: string }> {
    const t = await this.prisma.bankTransferSubmission.findUnique({ where: { paymentId } });
    if (!t?.receiptKey) throw new AppException('NOT_FOUND', 404, 'لا يوجد إيصال');
    const body = await this.files.get(t.receiptKey);
    const kind = detectFileType(body) ?? { type: 'application/octet-stream', ext: 'bin' };
    return { body, ...kind };
  }
}
