import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requestContext } from '../../common/context/request-context';
import { redact } from '../../common/security/redact';
import { PrismaService, type Db } from '../../prisma/prisma.service';

export interface AuditEntry {
  action: string; // e.g. property.update, settings.update, integration.secrets.update
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** Defaults to the actor of the current request, or `system`. */
  actor?: { type: 'staff' | 'customer' | 'system'; id: string | null };
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
}

/**
 * Append-only audit trail (CLAUDE.md: every state change of booking, payment, property status or lead
 * is audited). Values are redacted; pass a transaction client so the entry commits with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    const ctx = requestContext.get();
    const actor = entry.actor ?? ctx?.actor ?? { type: 'system' as const, id: null };
    await db.auditLog.create({
      data: {
        actorType: actor.type,
        actorId: actor.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    });
  }
}
