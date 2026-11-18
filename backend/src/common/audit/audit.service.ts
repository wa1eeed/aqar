import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { redact } from '../redact.js';

export interface AuditEntry {
  actorType: 'staff' | 'customer' | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/** يكتب كل تغيّر حالة إلى AuditLog (الأسرار تُحجب دائماً). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
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
