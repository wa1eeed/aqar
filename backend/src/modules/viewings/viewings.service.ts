import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type { CreateViewingInput, UpdateViewingInput, ViewingsQueryInput } from './dto';

const notFound = () => new AppException('NOT_FOUND', 404, 'الموعد غير موجود');
const MAX_RANGE_MS = 62 * 86_400_000;

const SELECT = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  notes: true,
  createdAt: true,
  property: { select: { id: true, code: true, title: true } },
  agent: { select: { id: true, name: true } },
  lead: { select: { id: true, number: true, name: true, phone: true } },
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.ViewingSelect;

/** Viewings calendar (docs/07 §5). Agents manage only their own viewings. */
@Injectable()
export class ViewingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(user: AuthUser, q: ViewingsQueryInput) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!(to > from) || to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new AppException('VALIDATION_FAILED', 400, 'نطاق التاريخ غير صحيح', { fields: { to: 'invalid_range' } });
    }
    const items = await this.prisma.viewing.findMany({
      where: {
        AND: [
          this.scope.forStaff(user).viewings(),
          { scheduledAt: { gte: from, lt: to } },
          q.agentId ? { agentId: q.agentId } : {},
          q.status ? { status: q.status } : {},
        ],
      },
      select: SELECT,
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
    return { items };
  }

  private async load(user: AuthUser, id: string) {
    const v = await this.prisma.viewing.findFirst({ where: { AND: [{ id }, this.scope.forStaff(user).viewings()] } });
    if (!v) throw notFound();
    return v;
  }

  async get(user: AuthUser, id: string) {
    await this.load(user, id);
    return this.prisma.viewing.findUniqueOrThrow({ where: { id }, select: SELECT });
  }

  /** The agent must be active; agents can only plan their own viewings. */
  private async resolveAgent(user: AuthUser, requested: string | null | undefined, fallback: string): Promise<string> {
    const agentId = user.scope === 'own' ? user.id : (requested ?? fallback);
    const ok = await this.prisma.staffUser.findFirst({
      where: { id: agentId, isActive: true, deletedAt: null, role: { permissions: { has: 'viewings.manage' } } },
      select: { id: true },
    });
    if (!ok) {
      throw new AppException('VALIDATION_FAILED', 400, 'المستشار غير متاح', { fields: { agentId: 'invalid_agent' } });
    }
    return agentId;
  }

  /**
   * One agent cannot have two confirmed viewings at the same time. Requested viewings are customer
   * wishes (several customers may ask for the same slot), so only confirmed ones block.
   */
  private async assertFree(agentId: string, at: Date, durationMin: number, exceptId?: string): Promise<void> {
    const end = new Date(at.getTime() + durationMin * 60_000);
    const others = await this.prisma.viewing.findMany({
      where: {
        agentId,
        status: 'confirmed',
        ...(exceptId ? { id: { not: exceptId } } : {}),
        scheduledAt: { lt: end, gte: new Date(at.getTime() - 4 * 3600_000) },
      },
      select: { scheduledAt: true, durationMin: true },
    });
    if (others.some((o) => o.scheduledAt.getTime() + o.durationMin * 60_000 > at.getTime())) {
      throw new AppException('VIEWING_CONFLICT', 409, 'لدى المستشار موعد آخر في هذا الوقت');
    }
  }

  async create(user: AuthUser, b: CreateViewingInput) {
    const property = await this.prisma.property.findFirst({
      where: { AND: [{ id: b.propertyId, deletedAt: null }] },
      select: { id: true, agentId: true },
    });
    if (!property) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    let lead: {
      id: string;
      customerId: string | null;
      stage: string;
      number: string;
      assignedToId: string | null;
    } | null = null;
    if (b.leadId) {
      lead = await this.prisma.lead.findFirst({
        where: { AND: [{ id: b.leadId }, this.scope.forStaff(user).leads()] },
        select: { id: true, customerId: true, stage: true, number: true, assignedToId: true },
      });
      if (!lead) throw new AppException('NOT_FOUND', 404, 'الطلب غير موجود');
    }
    const agentId = await this.resolveAgent(user, b.agentId, property.agentId);
    const at = new Date(b.scheduledAt);
    const status = b.status ?? 'confirmed';
    if (status === 'confirmed') await this.assertFree(agentId, at, b.durationMin);
    const v = await this.prisma.$transaction(async (tx) => {
      const created = await tx.viewing.create({
        data: {
          propertyId: property.id,
          leadId: lead?.id ?? null,
          customerId: lead?.customerId ?? null,
          agentId,
          scheduledAt: at,
          durationMin: b.durationMin,
          status,
          notes: b.notes || null,
        },
      });
      if (lead) {
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: 'viewing',
            actorId: user.id,
            meta: { viewingId: created.id, at: at.toISOString() },
          },
        });
        if (['new', 'contacted'].includes(lead.stage)) {
          await tx.lead.update({ where: { id: lead.id }, data: { stage: 'viewing' } });
          await this.audit.record(
            {
              action: 'lead.stage',
              entityType: 'lead',
              entityId: lead.id,
              before: { stage: lead.stage },
              after: { stage: 'viewing' },
            },
            tx,
          );
        }
      }
      await this.audit.record(
        {
          action: 'viewing.create',
          entityType: 'viewing',
          entityId: created.id,
          after: { propertyId: property.id, agentId, at, status },
        },
        tx,
      );
      return created;
    });
    if (lead && ['new', 'contacted'].includes(lead.stage)) {
      this.events.emit('lead.stage_changed', {
        id: lead.id,
        number: lead.number,
        assignedToId: lead.assignedToId,
        stage: 'viewing',
        actorId: user.id,
      });
    }
    if (status === 'confirmed') this.events.emit('viewing.confirmed', { viewingId: v.id });
    return this.get(user, v.id);
  }

  async update(user: AuthUser, id: string, b: UpdateViewingInput) {
    const before = await this.load(user, id);
    const at = b.scheduledAt ? new Date(b.scheduledAt) : before.scheduledAt;
    const duration = b.durationMin ?? before.durationMin;
    const agentId = b.agentId !== undefined ? await this.resolveAgent(user, b.agentId, before.agentId) : before.agentId;
    const status = b.status ?? before.status;
    const changed =
      at.getTime() !== before.scheduledAt.getTime() || duration !== before.durationMin || agentId !== before.agentId;
    if (status === 'confirmed' && (before.status !== 'confirmed' || changed)) {
      await this.assertFree(agentId, at, duration, id);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.viewing.update({
        where: { id },
        data: {
          scheduledAt: at,
          durationMin: duration,
          agentId,
          status,
          ...(b.notes !== undefined ? { notes: b.notes || null } : {}),
        },
      });
      if (before.leadId && status !== before.status) {
        await tx.leadActivity.create({
          data: { leadId: before.leadId, type: 'viewing', actorId: user.id, meta: { viewingId: id, status } },
        });
      }
      await this.audit.record(
        {
          action: 'viewing.update',
          entityType: 'viewing',
          entityId: id,
          before: { status: before.status, scheduledAt: before.scheduledAt, agentId: before.agentId },
          after: { status, scheduledAt: at, agentId },
        },
        tx,
      );
    });
    // Confirmation, or a new time for a confirmed viewing, tells the customer (docs/06 viewing.confirmed).
    const moved = at.getTime() !== before.scheduledAt.getTime();
    if (status === 'confirmed' && (before.status !== 'confirmed' || moved)) {
      this.events.emit('viewing.confirmed', { viewingId: id });
    }
    return this.get(user, id);
  }
}
