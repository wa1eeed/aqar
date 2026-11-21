import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { redact } from '../redact.js';

export interface AuditEntry {
  actorType: 'platform' | 'staff' | 'customer' | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  /** يُستنتج من السياق إن لم يُمرَّر؛ null لأفعال المنصّة. */
  tenantId?: string | null;
}

/** يكتب كل تغيّر حالة إلى AuditLog (الأسرار تُحجب دائماً). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** قراءة سجلّ التدقيق للمشترك الحالي (audit.view). */
  async list(filters: { entityType?: string; entityId?: string; actorId?: string } = {}) {
    const where: Record<string, unknown> = { tenantId: this.tenant.tenantId };
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.actorId) where.actorId = filters.actorId;
    return this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async record(entry: AuditEntry): Promise<void> {
    try {
      // AuditLog بـ tenantId اختياري — نستخدم العميل الأساسي ونضبط tenantId صراحةً.
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId !== undefined ? entry.tenantId : this.tenant.tenantId,
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before === undefined ? undefined : (redact(entry.before) as object),
          after: entry.after === undefined ? undefined : (redact(entry.after) as object),
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      // التدقيق لا يجب أن يُفشل العملية الأساسية
      this.logger.error(`تعذّر كتابة سجل التدقيق لـ ${entry.action}`, err instanceof Error ? err.stack : undefined);
    }
  }
}
