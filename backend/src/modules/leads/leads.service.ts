import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { normalizePagination, paginate } from '../../common/pagination.js';
import { uniqueCode } from '../../common/code.js';
import { normalizeSaudiPhone } from './phone.js';
import type { AuthUser } from '../auth/auth-user.js';

const LEAD_TYPES = ['viewing', 'waitlist', 'buy', 'rent', 'list', 'invest', 'manage', 'contact'] as const;
const TYPE_LABEL: Record<string, string> = {
  viewing: 'معاينة', waitlist: 'قائمة انتظار', buy: 'شراء', rent: 'إيجار',
  list: 'عرض عقار', invest: 'استثمار', manage: 'إدارة أملاك', contact: 'تواصل',
};
const STAGE_LABEL: Record<string, string> = {
  new: 'جديد', contacted: 'تم التواصل', viewing: 'معاينة', negotiation: 'تفاوض', won: 'مكسوب', lost: 'مفقود',
};
const SLOT_HOUR: Record<string, number> = { morning: 10, afternoon: 14, evening: 18 };

// الواجهة ترسل الحقول نصّاً من نموذج HTML؛ نحوّل الفراغ إلى null والميزانية (قد تحوي فواصل) إلى رقم.
const emptyToNull = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);
const budgetFromInput = (v: unknown): unknown => {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return v;
};

export const publicLeadSchema = z.object({
  type: z.enum(LEAD_TYPES),
  propertyId: z.number().int().optional().nullable(),
  name: z.string().min(2).max(120),
  phone: z.string().min(6),
  email: z.preprocess(emptyToNull, z.string().email().nullable().optional()),
  date: z.string().optional().nullable(),
  slot: z.enum(['morning', 'afternoon', 'evening']).optional().nullable(),
  notes: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  propertyType: z.string().optional().nullable(),
  budget: z.preprocess(budgetFromInput, z.number().int().nonnegative().nullable().optional()),
  message: z.string().optional().nullable(),
  consent: z.boolean().optional(),
  utm: z.record(z.unknown()).optional().nullable(),
});
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

interface Actor {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly access: AccessScopeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────── Public ─────────
  async createPublic(input: PublicLeadInput, customerId?: string | null) {
    const tenantId = this.tenant.requireTenantId();
    const data = publicLeadSchema.parse(input);
    const phone = normalizeSaudiPhone(data.phone);
    if (!phone) throw new BadRequestException('رقم جوال سعودي غير صالح');
    if ((data.type === 'viewing' || data.type === 'waitlist') && !data.propertyId) {
      throw new BadRequestException('العقار مطلوب لهذا النوع من الطلبات');
    }

    let property: { id: number; title: string; agentId: string } | null = null;
    if (data.propertyId) {
      property = await this.prisma.scoped.property.findFirst({
        where: { id: data.propertyId },
        select: { id: true, title: true, agentId: true },
      });
      if (!property) throw new BadRequestException('العقار غير موجود');
    }

    const assignedToId = property?.agentId ?? (await this.pickAgent(tenantId));
    const number = await uniqueCode('L', (c) =>
      this.prisma.scoped.lead.findFirst({ where: { number: c }, select: { id: true } }).then((r) => !!r),
    );

    const lead = await this.prisma.scoped.lead.create({
      data: {
        tenantId,
        number,
        type: data.type,
        source: 'website',
        propertyId: property?.id ?? null,
        customerId: customerId ?? null,
        name: data.name,
        phone,
        email: data.email ?? null,
        cityId: data.city ?? null,
        propertyType: data.propertyType ?? null,
        budget: data.budget != null ? BigInt(data.budget) : null,
        message: data.message ?? data.notes ?? null,
        preferredDate: data.date ? new Date(data.date) : null,
        preferredSlot: data.slot ?? null,
        assignedToId,
        consent: data.consent ?? true,
        utm: (data.utm ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // معاينة عند الطلب
    if (data.type === 'viewing' && data.date && data.slot && property) {
      const scheduledAt = new Date(data.date);
      scheduledAt.setHours(SLOT_HOUR[data.slot] ?? 10, 0, 0, 0);
      await this.prisma.scoped.viewing.create({
        data: {
          tenantId,
          propertyId: property.id,
          leadId: lead.id,
          customerId: customerId ?? null,
          agentId: assignedToId,
          scheduledAt,
          status: 'requested',
        },
      });
    }

    await this.notifyCreated(lead, property, data.type);
    return { id: lead.id, number: lead.number };
  }

  private async notifyCreated(
    lead: { id: string; number: string; assignedToId: string | null },
    property: { title: string } | null,
    type: string,
  ) {
    const tenantId = this.tenant.requireTenantId();
    const managers = await this.prisma.staffUser.findMany({
      where: { tenantId, isActive: true, deletedAt: null, role: { key: 'sales_manager' } },
      select: { id: true },
    });
    const ids = new Set<string>(managers.map((m) => m.id));
    if (lead.assignedToId) ids.add(lead.assignedToId);
    const title = `طلب جديد: ${TYPE_LABEL[type] ?? type}${property ? ` — ${property.title}` : ''}`;
    await this.notifications.notify({
      eventKey: type === 'viewing' ? 'viewing.requested' : 'lead.created',
      recipients: [...ids].map((id) => ({ type: 'staff' as const, id })),
      title,
      body: `رقم الطلب ${lead.number}`,
      link: `/admin/leads/${lead.id}`,
      data: { id: lead.id },
      email: {
        subject: title,
        html: `<div dir="rtl">${title}<br>رقم الطلب: ${lead.number}</div>`,
        text: `${title} — ${lead.number}`,
      },
    });
  }

  private async pickAgent(tenantId: string): Promise<string> {
    const agents = await this.prisma.staffUser.findMany({
      where: { tenantId, isActive: true, deletedAt: null, role: { key: 'agent' } },
      select: { id: true, _count: { select: { assignedLeads: true } } },
    });
    if (!agents.length) {
      const anyStaff = await this.prisma.staffUser.findFirst({ where: { tenantId, isActive: true }, select: { id: true } });
      if (!anyStaff) throw new BadRequestException('لا يوجد موظف لإسناد الطلب');
      return anyStaff.id;
    }
    agents.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads);
    return agents[0].id;
  }

  // ───────── Admin ─────────
  async adminList(query: Record<string, unknown>, user: AuthUser) {
    const tenantId = this.tenant.requireTenantId();
    const scope = this.access.forStaff(user).leads;
    const str = (k: string) => (typeof query[k] === 'string' ? (query[k] as string) : undefined);
    const where: Prisma.LeadWhereInput = { tenantId, ...scope };
    if (str('stage')) where.stage = str('stage') as never;
    if (str('type')) where.type = str('type') as never;
    if (str('assignee')) where.assignedToId = str('assignee');
    if (str('source')) where.source = str('source') as never;
    if (str('q')) {
      where.OR = [
        { name: { contains: str('q')!, mode: 'insensitive' } },
        { phone: { contains: str('q')! } },
        { number: { contains: str('q')!, mode: 'insensitive' } },
      ];
    }
    const { page, pageSize, skip, take } = normalizePagination(
      query.page ? Number(query.page) : undefined,
      query.pageSize ? Number(query.pageSize) : undefined,
    );
    const [items, total] = await Promise.all([
      this.prisma.scoped.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { property: { select: { title: true } }, assignedTo: { select: { name: true } } } }),
      this.prisma.scoped.lead.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async adminGet(id: string, user: AuthUser) {
    const lead = await this.prisma.scoped.lead.findFirst({
      where: { id, ...this.access.forStaff(user).leads },
      include: { property: true, activities: { orderBy: { createdAt: 'desc' } }, viewings: true },
    });
    if (!lead) throw new NotFoundException('الطلب غير موجود');
    return lead;
  }

  async changeStage(id: string, stage: string, actor: Actor) {
    const lead = await this.requireOwned(id, actor.user);
    const updated = await this.prisma.scoped.lead.update({
      where: { id },
      data: { stage: stage as never, closedAt: stage === 'won' || stage === 'lost' ? new Date() : null },
    });
    await this.addActivityRow(id, 'stage_change', `إلى ${STAGE_LABEL[stage] ?? stage}`, actor.user.sub);
    if (lead.assignedToId) {
      await this.notifications.notify({
        eventKey: 'lead.stage_changed',
        recipients: [{ type: 'staff', id: lead.assignedToId }],
        title: `تغيّرت حالة الطلب ${lead.number} إلى ${STAGE_LABEL[stage] ?? stage}`,
        body: '',
        link: `/admin/leads/${id}`,
        data: { id },
      });
    }
    return updated;
  }

  async assign(id: string, assigneeId: string, actor: Actor) {
    await this.requireOwned(id, actor.user);
    const lead = await this.prisma.scoped.lead.update({ where: { id }, data: { assignedToId: assigneeId } });
    await this.addActivityRow(id, 'assignment', `أُسند إلى ${assigneeId}`, actor.user.sub);
    await this.notifications.notify({
      eventKey: 'lead.assigned',
      recipients: [{ type: 'staff', id: assigneeId }],
      title: `أُسند إليك طلب ${lead.number}`,
      body: '',
      link: `/admin/leads/${id}`,
      data: { id },
      email: { subject: `أُسند إليك طلب ${lead.number}`, html: `أُسند إليك الطلب ${lead.number}`, text: `أُسند إليك الطلب ${lead.number}` },
    });
    return lead;
  }

  async addActivity(id: string, type: string, body: string, actor: Actor) {
    await this.requireOwned(id, actor.user);
    return this.addActivityRow(id, type, body, actor.user.sub);
  }

  private addActivityRow(leadId: string, type: string, body: string, actorId: string) {
    const tenantId = this.tenant.requireTenantId();
    return this.prisma.scoped.leadActivity.create({
      data: { tenantId, leadId, type: type as never, body, actorId },
    });
  }

  private async requireOwned(id: string, user: AuthUser) {
    const lead = await this.prisma.scoped.lead.findFirst({ where: { id, ...this.access.forStaff(user).leads } });
    if (!lead) throw new NotFoundException('الطلب غير موجود أو لا تملك صلاحيته');
    return lead;
  }
}
