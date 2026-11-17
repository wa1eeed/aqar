import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { leadSources, leadStages, leadTypes, type LeadStage } from '@nx/schema';
import type { LeadActivityType, Prisma } from '@prisma/client';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { nextCounter } from '../../common/counter';
import { AppException } from '../../common/errors/app-exception';
import { toCsv } from '../../common/http/csv';
import { normaliseSaudiMobile } from '../../common/security/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type { LeadsQueryInput, ManualLeadInput, UpdateLeadInput } from './dto';

const notFound = () => new AppException('NOT_FOUND', 404, 'الطلب غير موجود');
const CLOSED: LeadStage[] = ['won', 'lost'];

export const LEAD_LIST_SELECT = {
  id: true,
  number: true,
  type: true,
  stage: true,
  source: true,
  name: true,
  phone: true,
  email: true,
  preferredDate: true,
  preferredSlot: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
  property: { select: { id: true, code: true, title: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

/** CRM leads (docs/07 §4). Agents only ever see leads assigned to them (AccessScopeService). */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  where(user: AuthUser, q: Partial<LeadsQueryInput>): Prisma.LeadWhereInput {
    const and: Prisma.LeadWhereInput[] = [this.scope.forStaff(user).leads()];
    if (q.stage) and.push({ stage: q.stage });
    if (q.type) and.push({ type: q.type });
    if (q.source) and.push({ source: q.source });
    if (q.assignedToId) and.push({ assignedToId: q.assignedToId === 'none' ? null : q.assignedToId });
    if (q.from) and.push({ createdAt: { gte: new Date(`${q.from}T00:00:00+03:00`) } });
    if (q.to) and.push({ createdAt: { lt: new Date(new Date(`${q.to}T00:00:00+03:00`).getTime() + 86_400_000) } });
    if (q.q) {
      const term = q.q.trim();
      const digits = term.replace(/\D/g, '');
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { number: { contains: term.toUpperCase() } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : []),
        ],
      });
    }
    return { AND: and };
  }

  async list(user: AuthUser, q: LeadsQueryInput) {
    const where = this.where(user, q);
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select: LEAD_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.ceil(total / q.pageSize) };
  }

  /** Kanban: newest leads per stage (docs/07 §4) with each column's total. */
  async board(user: AuthUser, q: LeadsQueryInput) {
    const columns = await Promise.all(
      (Object.keys(leadStages) as LeadStage[]).map(async (stage) => {
        const where = this.where(user, { ...q, stage });
        const [items, total] = await Promise.all([
          this.prisma.lead.findMany({ where, select: LEAD_LIST_SELECT, orderBy: { updatedAt: 'desc' }, take: 50 }),
          this.prisma.lead.count({ where }),
        ]);
        return { stage, total, items };
      }),
    );
    return { columns };
  }

  private async load(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { AND: [{ id }, this.scope.forStaff(user).leads()] } });
    if (!lead) throw notFound();
    return lead;
  }

  async get(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id }, this.scope.forStaff(user).leads()] },
      include: {
        property: {
          select: {
            id: true,
            code: true,
            title: true,
            price: true,
            offer: true,
            rentPeriod: true,
            status: true,
            media: {
              where: { isCover: true, status: 'ready' },
              select: { variants: true },
              take: 1,
            },
          },
        },
        assignedTo: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
        viewings: {
          orderBy: { scheduledAt: 'desc' },
          select: { id: true, scheduledAt: true, status: true, agent: { select: { id: true, name: true } } },
        },
      },
    });
    if (!lead) throw notFound();
    const actorIds = [...new Set(lead.activities.map((a) => a.actorId).filter((x): x is string => !!x))];
    const actors = actorIds.length
      ? await this.prisma.staffUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(actors.map((a) => [a.id, a.name]));
    const { media, ...property } = lead.property ?? { media: [] };
    return {
      ...lead,
      property: lead.property
        ? { ...property, cover: (media[0]?.variants as { thumb?: string } | null)?.thumb ?? null }
        : null,
      activities: lead.activities.map((a) => ({ ...a, actorName: a.actorId ? (names.get(a.actorId) ?? null) : null })),
    };
  }

  private async activity(
    db: Prisma.TransactionClient,
    leadId: string,
    type: LeadActivityType,
    actorId: string | null,
    body: string | null,
    meta?: Record<string, unknown>,
  ) {
    await db.leadActivity.create({
      data: { leadId, type, actorId, body, ...(meta ? { meta: meta as Prisma.InputJsonValue } : {}) },
    });
  }

  async update(user: AuthUser, id: string, b: UpdateLeadInput) {
    const before = await this.load(user, id);
    const data: Prisma.LeadUncheckedUpdateInput = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.phone !== undefined) data.phone = normaliseSaudiMobile(b.phone)!;
    if (b.email !== undefined) data.email = b.email || null;
    if (b.message !== undefined) data.message = b.message || null;
    if (b.propertyId !== undefined) {
      if (
        b.propertyId !== null &&
        !(await this.prisma.property.findFirst({ where: { id: b.propertyId, deletedAt: null } }))
      )
        throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
      data.propertyId = b.propertyId;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data });
      await this.audit.record(
        {
          action: 'lead.update',
          entityType: 'lead',
          entityId: id,
          before: { name: before.name, phone: before.phone, email: before.email, propertyId: before.propertyId },
          after: b,
        },
        tx,
      );
    });
    return this.get(user, id);
  }

  async changeStage(user: AuthUser, id: string, stage: LeadStage, lostReason?: string) {
    const before = await this.load(user, id);
    if (stage === 'lost' && !lostReason?.trim()) {
      throw new AppException('VALIDATION_FAILED', 400, 'سبب عدم إتمام الصفقة مطلوب', {
        fields: { lostReason: 'Required' },
      });
    }
    if (before.stage === stage) return this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: {
          stage,
          lostReason: stage === 'lost' ? lostReason!.trim() : null,
          closedAt: CLOSED.includes(stage) ? new Date() : null,
        },
      });
      await this.activity(tx, id, 'stage_change', user.id, stage === 'lost' ? lostReason!.trim() : null, {
        from: before.stage,
        to: stage,
      });
      await this.audit.record(
        {
          action: 'lead.stage',
          entityType: 'lead',
          entityId: id,
          before: { stage: before.stage },
          after: { stage, lostReason },
        },
        tx,
      );
    });
    this.events.emit('lead.stage_changed', {
      id,
      number: before.number,
      assignedToId: before.assignedToId,
      stage,
      actorId: user.id,
    });
    return this.get(user, id);
  }

  async assign(user: AuthUser, id: string, assignedToId: string | null) {
    const before = await this.load(user, id);
    if (assignedToId) {
      const s = await this.prisma.staffUser.findFirst({
        where: { id: assignedToId, isActive: true, deletedAt: null, role: { permissions: { has: 'leads.view' } } },
        select: { id: true, name: true },
      });
      if (!s) {
        throw new AppException('VALIDATION_FAILED', 400, 'لا يمكن إسناد الطلب لهذا المستخدم', {
          fields: { assignedToId: 'invalid_assignee' },
        });
      }
    }
    if (before.assignedToId === assignedToId) return this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { assignedToId } });
      await this.activity(tx, id, 'assignment', user.id, null, { from: before.assignedToId, to: assignedToId });
      await this.audit.record(
        {
          action: 'lead.assign',
          entityType: 'lead',
          entityId: id,
          before: { assignedToId: before.assignedToId },
          after: { assignedToId },
        },
        tx,
      );
    });
    this.events.emit('lead.assigned', { id, number: before.number, assignedToId, actorId: user.id });
    return this.get(user, id);
  }

  async addActivity(user: AuthUser, id: string, type: 'note' | 'call' | 'whatsapp' | 'email', body: string) {
    const lead = await this.load(user, id);
    // A first contact (call, WhatsApp, email) moves a new lead to «تم التواصل» — audited like any stage change.
    const touch = type !== 'note' && lead.stage === 'new';
    await this.prisma.$transaction(async (tx) => {
      await this.activity(tx, id, type, user.id, body);
      if (touch) {
        await tx.lead.update({ where: { id }, data: { stage: 'contacted' } });
        await this.activity(tx, id, 'stage_change', user.id, null, { from: 'new', to: 'contacted' });
        await this.audit.record(
          {
            action: 'lead.stage',
            entityType: 'lead',
            entityId: id,
            before: { stage: 'new' },
            after: { stage: 'contacted' },
          },
          tx,
        );
      }
    });
    if (touch) {
      this.events.emit('lead.stage_changed', {
        id,
        number: lead.number,
        assignedToId: lead.assignedToId,
        stage: 'contacted',
        actorId: user.id,
      });
    }
    return this.get(user, id);
  }

  /** Manual lead (phone call, WhatsApp, office visit). Agents create leads for themselves. */
  async create(user: AuthUser, b: ManualLeadInput) {
    let property: { id: number; agentId: string } | null = null;
    if (b.propertyId) {
      property = await this.prisma.property.findFirst({
        where: { id: b.propertyId, deletedAt: null },
        select: { id: true, agentId: true },
      });
      if (!property) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    }
    const own = user.scope === 'own';
    const assignedToId = own ? user.id : (b.assignedToId ?? property?.agentId ?? null);
    if (!own && b.assignedToId && !user.perms.includes('leads.assign')) {
      throw new AppException('FORBIDDEN', 403, 'لا تملك صلاحية إسناد الطلبات');
    }
    const lead = await this.prisma.$transaction(async (tx) => {
      const number = `L-${String(await nextCounter(tx, 'lead')).padStart(6, '0')}`;
      const l = await tx.lead.create({
        data: {
          number,
          type: b.type,
          source: b.source,
          propertyId: property?.id ?? null,
          name: b.name,
          phone: normaliseSaudiMobile(b.phone)!,
          email: b.email || null,
          message: b.message || null,
          assignedToId,
          consent: true,
        },
      });
      await this.activity(tx, l.id, 'system', user.id, null, { created: b.source });
      await this.audit.record(
        {
          action: 'lead.create',
          entityType: 'lead',
          entityId: l.id,
          after: { number, type: b.type, source: b.source },
        },
        tx,
      );
      return l;
    });
    this.events.emit('lead.created', { id: lead.id, number: lead.number, assignedToId, actorId: user.id });
    return this.get(user, lead.id);
  }

  /** Find the customer account matching the lead's phone/email, or create one (docs/07 §4). */
  async linkCustomer(user: AuthUser, id: string) {
    const lead = await this.load(user, id);
    if (lead.customerId) return this.get(user, id);
    let c = await this.prisma.customer.findFirst({
      where: { OR: [{ phone: lead.phone }, ...(lead.email ? [{ email: lead.email }] : [])], deletedAt: null },
      select: { id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      if (!c) {
        c = await tx.customer.create({
          data: {
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            consentAt: lead.consent ? lead.createdAt : null,
          },
          select: { id: true },
        });
        await this.audit.record(
          { action: 'customer.create', entityType: 'customer', entityId: c.id, after: { from: 'lead', leadId: id } },
          tx,
        );
      }
      await tx.lead.update({ where: { id }, data: { customerId: c.id } });
      await tx.viewing.updateMany({ where: { leadId: id, customerId: null }, data: { customerId: c.id } });
      await this.audit.record(
        { action: 'lead.link_customer', entityType: 'lead', entityId: id, after: { customerId: c.id } },
        tx,
      );
    });
    return this.get(user, id);
  }

  async exportCsv(user: AuthUser, q: LeadsQueryInput): Promise<string> {
    const rows = await this.prisma.lead.findMany({
      where: this.where(user, q),
      select: LEAD_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    await this.audit.record({
      action: 'lead.export',
      entityType: 'lead',
      entityId: 'csv',
      after: { count: rows.length },
    });
    return toCsv(
      [
        'الرقم',
        'التاريخ',
        'النوع',
        'المرحلة',
        'المصدر',
        'الاسم',
        'الجوال',
        'البريد',
        'العقار',
        'المسؤول',
        'سبب عدم الإتمام',
      ],
      rows.map((l) => [
        l.number,
        l.createdAt.toISOString().slice(0, 10),
        leadTypes[l.type],
        leadStages[l.stage].label,
        leadSources[l.source],
        l.name,
        l.phone,
        l.email,
        l.property ? `${l.property.code} ${l.property.title}` : '',
        l.assignedTo?.name ?? '',
        l.lostReason,
      ]),
    );
  }
}
