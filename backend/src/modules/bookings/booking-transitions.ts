import { Injectable } from '@nestjs/common';
import type { Booking, BookingStatus, Prisma, PropertyStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';

/** Allowed transitions (docs/04 §4). */
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending_payment: ['awaiting_transfer_review', 'confirmed', 'expired', 'cancelled'],
  awaiting_transfer_review: ['pending_payment', 'confirmed', 'cancelled', 'expired'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['refunded'],
  expired: [],
  refunded: [],
};

export const ACTIVE_BOOKING: BookingStatus[] = ['pending_payment', 'awaiting_transfer_review', 'confirmed'];

export interface TransitionActor {
  type: 'staff' | 'customer' | 'system';
  id: string | null;
}

/** Events to emit after the transaction commits (key + payload). */
export type PendingEvent = [string, Record<string, unknown>];

/**
 * The booking state machine and its property side effects, applied inside the caller's transaction:
 * status + timestamps, `PropertyStatusHistory` rows, audit log, and the list of domain events to emit
 * once the transaction has committed.
 */
@Injectable()
export class BookingTransitions {
  constructor(private readonly audit: AuditService) {}

  async apply(
    tx: Prisma.TransactionClient,
    booking: Booking,
    to: BookingStatus,
    opts: { actor: TransitionActor; reason?: string | null },
  ): Promise<PendingEvent[]> {
    if (booking.status === to) return [];
    if (!ALLOWED[booking.status].includes(to)) {
      throw new AppException('BOOKING_INVALID_TRANSITION', 422, 'لا يمكن تنفيذ هذا الإجراء في حالة الحجز الحالية', {
        from: booking.status,
        to,
      });
    }
    const now = new Date();
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: to,
        ...(to === 'confirmed' ? { confirmedAt: now } : {}),
        ...(to === 'completed' ? { completedAt: now } : {}),
        ...(to === 'cancelled' ? { cancelledAt: now, cancelReason: opts.reason ?? null } : {}),
      },
    });
    const events: PendingEvent[] = [];
    const propertyChange = await this.propertySideEffect(tx, booking, to, opts.actor);
    if (propertyChange) events.push(['property.status_changed', propertyChange]);

    await this.audit.record(
      {
        action: `booking.${to}`,
        entityType: 'booking',
        entityId: booking.id,
        before: { status: booking.status },
        after: { status: to, ...(opts.reason ? { reason: opts.reason } : {}) },
        actor:
          opts.actor.type === 'system' ? { type: 'system', id: null } : { type: opts.actor.type, id: opts.actor.id },
      },
      tx,
    );
    const key: Partial<Record<BookingStatus, string>> = {
      confirmed: 'booking.confirmed',
      completed: 'booking.completed',
      cancelled: 'booking.cancelled',
      expired: 'booking.expired',
    };
    if (key[to]) events.push([key[to]!, { bookingId: booking.id, reason: opts.reason ?? null }]);
    events.push(['booking.updated', { bookingId: booking.id }]);
    return events;
  }

  /**
   * confirmed → property reserved; completed → sold/rented; cancelled/refunded after confirmation →
   * back to available only if it is still reserved by this booking (docs/04 §4).
   */
  private async propertySideEffect(
    tx: Prisma.TransactionClient,
    booking: Booking,
    to: BookingStatus,
    actor: TransitionActor,
  ): Promise<Record<string, unknown> | null> {
    const p = await tx.property.findUniqueOrThrow({
      where: { id: booking.propertyId },
      select: { id: true, status: true, offer: true, agentId: true },
    });
    let next: PropertyStatus | null = null;
    let reason = '';
    if (to === 'confirmed' && (p.status === 'available' || p.status === 'negotiation')) {
      next = 'reserved';
      reason = 'booking_confirmed';
    } else if (to === 'completed') {
      next = p.offer === 'rent' ? 'rented' : 'sold';
      reason = 'booking_completed';
    } else if ((to === 'cancelled' || to === 'refunded') && booking.confirmedAt && p.status === 'reserved') {
      const last = await tx.propertyStatusHistory.findFirst({
        where: { propertyId: p.id, to: 'reserved' },
        orderBy: { createdAt: 'desc' },
        select: { bookingId: true },
      });
      if (last?.bookingId === booking.id) {
        next = 'available';
        reason = 'booking_cancelled';
      }
    }
    if (!next || next === p.status) return null;
    await tx.property.update({ where: { id: p.id }, data: { status: next } });
    await tx.propertyStatusHistory.create({
      data: {
        propertyId: p.id,
        from: p.status,
        to: next,
        reason,
        bookingId: booking.id,
        actorType: actor.type === 'staff' ? 'staff' : 'system',
        actorId: actor.type === 'staff' ? actor.id : null,
      },
    });
    return { propertyId: p.id, from: p.status, to: next, agentId: p.agentId, actorId: actor.id };
  }
}
