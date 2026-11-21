import { Injectable } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';

// الأدوار المقيّدة على صفوفها فقط ("own"/"assigned only" في docs/03).
const SCOPED_ROLES = new Set(['agent']);

export interface StaffScopes {
  /** قيد where على الطلبات (Lead): المسندة للموظف فقط. */
  leads: Record<string, unknown>;
  /** قيد where على العقارات (Property): من إنشاء/مسؤولية الموظف فقط. */
  properties: Record<string, unknown>;
  /** قيد where على المعاينات (Viewing). */
  viewings: Record<string, unknown>;
  /** قيد where على الحجوزات (Booking): عبر عقار الموظف. */
  bookings: Record<string, unknown>;
}

/**
 * يُنتج أجزاء Prisma `where` لتقييد وصول الموظف إلى صفوفه حين يكون دوره مقيّداً.
 * يُستعمل في خدمات المرحلة 3+ إلى جانب العزل بالمشترك (tenantId).
 */
@Injectable()
export class AccessScopeService {
  isScoped(user: AuthUser): boolean {
    return user.typ === 'staff' && SCOPED_ROLES.has(user.role ?? '');
  }

  forStaff(user: AuthUser): StaffScopes {
    if (!this.isScoped(user)) {
      return { leads: {}, properties: {}, viewings: {}, bookings: {} };
    }
    const id = user.sub;
    return {
      leads: { assignedToId: id },
      properties: { agentId: id },
      viewings: { agentId: id },
      bookings: { property: { agentId: id } },
    };
  }
}
