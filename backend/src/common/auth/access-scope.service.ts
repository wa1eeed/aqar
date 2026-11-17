import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../modules/auth/auth.types';

/**
 * Row-level scopes (docs/03 §3: "own" / "assigned only" are enforced in services, not only guards).
 * Every staff query on scoped entities must AND its `where` with the fragment returned here.
 */
@Injectable()
export class AccessScopeService {
  forStaff(user: AuthUser) {
    const own = user.typ === 'staff' && user.scope === 'own';
    const id = user.id;
    return {
      /** Agents: their own listings. */
      properties: (): Prisma.PropertyWhereInput => (own ? { agentId: id } : {}),
      /** Agents: leads assigned to them. */
      leads: (): Prisma.LeadWhereInput => (own ? { assignedToId: id } : {}),
      /** Agents: their own viewings. */
      viewings: (): Prisma.ViewingWhereInput => (own ? { agentId: id } : {}),
      /** Agents: bookings on their own listings. */
      bookings: (): Prisma.BookingWhereInput => (own ? { property: { agentId: id } } : {}),
      /** Agents: customers linked to their leads or to bookings on their listings. */
      customers: (): Prisma.CustomerWhereInput =>
        own
          ? { OR: [{ leads: { some: { assignedToId: id } } }, { bookings: { some: { property: { agentId: id } } } }] }
          : {},
    };
  }
}
