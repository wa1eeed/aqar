import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TYPE_KEYS } from '@nx/schema';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nextCounter } from '../../common/counter';
import { AppException } from '../../common/errors/app-exception';
import { normaliseSaudiMobile, SAUDI_MOBILE } from '../../common/security/phone';
import { plainText } from '../../common/security/zod-helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';

const LEAD_TYPES = ['viewing', 'waitlist', 'buy', 'rent', 'list', 'invest', 'manage', 'contact'] as const;
const optText = (max: number) => z.union([z.literal(''), plainText(max)]).nullish();

/** docs/02 §2.2 */
export const leadSchema = z
  .object({
    type: z.enum(LEAD_TYPES),
    propertyId: z.number().int().min(1).max(2_147_483_647).nullish(),
    name: plainText(80).pipe(z.string().min(2)),
    phone: z.string().trim().max(20).regex(SAUDI_MOBILE, 'invalid_phone'),
    email: z.union([z.literal(''), z.string().trim().toLowerCase().max(254).email('invalid_email')]).nullish(),
    date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date')]).nullish(),
    slot: z.union([z.literal(''), z.enum(['morning', 'afternoon', 'evening'])]).nullish(),
    notes: optText(1000),
    city: optText(40),
    propertyType: optText(40),
    // Free text in the form ("2,000,000"): digits only, SAR.
    budget: z.union([z.number().min(0).max(1e12), z.string().max(30)]).nullish(),
    message: optText(2000),
    consent: z.literal(true, { errorMap: () => ({ message: 'consent_required' }) }),
    utm: z
      .record(z.string().max(30), z.string().max(120))
      .refine((u) => Object.keys(u).length <= 10, 'too_many_keys')
      .nullish(),
  })
  .strict()
  .refine((l) => !['viewing', 'waitlist'].includes(l.type) || !!l.propertyId, {
    message: 'property_required',
    path: ['propertyId'],
  });

export class PublicLeadDto extends createZodDto(leadSchema) {}

/** Riyadh is UTC+3 without DST: morning 10:00, afternoon 16:00, evening 19:00 local (the modal's windows). */
const SLOT_HOUR_UTC = { morning: 7, afternoon: 13, evening: 16 } as const;

@Injectable()
export class PublicLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** docs/02 §2.2: property agent, otherwise round-robin among active agents (or managers only). */
  private async assignee(propertyAgentId: string | null): Promise<string | null> {
    if (propertyAgentId) return propertyAgentId;
    if ((await this.settings.get('notifications')).leadRouting === 'manager_only') return null;
    const agents = await this.prisma.staffUser.findMany({
      where: { isActive: true, deletedAt: null, role: { key: 'agent' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!agents.length) return null;
    const n = await this.redis.incr('lead:round-robin');
    return agents[(n - 1) % agents.length]!.id;
  }

  async create(
    dto: PublicLeadDto,
    customer: AuthUser | undefined,
    idempotencyKey: string | undefined,
  ): Promise<{ id: string; number: string }> {
    const idemKey =
      idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey) ? `idem:lead:${idempotencyKey}` : null;
    if (idemKey) {
      const prev = await this.redis.get(idemKey);
      if (prev) return JSON.parse(prev) as { id: string; number: string };
    }

    let property: { id: number; agentId: string } | null = null;
    if (dto.propertyId) {
      property = await this.prisma.property.findFirst({
        where: { id: dto.propertyId, visibility: 'published', deletedAt: null },
        select: { id: true, agentId: true },
      });
      if (!property) throw new AppException('NOT_FOUND', 404, 'العقار غير موجود');
    }
    const cityId = dto.city
      ? ((
          await this.prisma.city.findFirst({
            where: { OR: [{ id: dto.city }, { nameAr: dto.city }] },
            select: { id: true },
          })
        )?.id ?? null)
      : null;
    const budgetDigits =
      typeof dto.budget === 'number' ? dto.budget : Number(String(dto.budget ?? '').replace(/[^\d.]/g, ''));
    const budget = Number.isFinite(budgetDigits) && budgetDigits > 0 ? BigInt(Math.round(budgetDigits * 100)) : null;
    const preferredDate = dto.date ? new Date(`${dto.date}T00:00:00Z`) : null;
    if (preferredDate && preferredDate.getTime() < Date.now() - 86_400_000) {
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { date: 'date_in_past' },
      });
    }
    const assignedToId = await this.assignee(property?.agentId ?? null);

    const lead = await this.prisma.$transaction(async (tx) => {
      const number = `L-${String(await nextCounter(tx, 'lead')).padStart(6, '0')}`;
      const l = await tx.lead.create({
        data: {
          number,
          type: dto.type,
          source: 'website',
          propertyId: property?.id ?? null,
          customerId: customer?.typ === 'customer' ? customer.id : null,
          name: dto.name,
          phone: normaliseSaudiMobile(dto.phone)!,
          email: dto.email || null,
          cityId,
          propertyType:
            dto.propertyType && (TYPE_KEYS as readonly string[]).includes(dto.propertyType) ? dto.propertyType : null,
          budget,
          message: (dto.message || dto.notes || null) as string | null,
          preferredDate,
          preferredSlot: dto.slot || null,
          assignedToId,
          consent: true,
          utm: dto.utm ? (dto.utm as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      await tx.leadActivity.create({
        data: { leadId: l.id, type: 'system', meta: { created: 'website', assignedToId } as Prisma.InputJsonValue },
      });
      if (dto.type === 'viewing' && property && preferredDate && dto.slot) {
        const at = new Date(preferredDate);
        at.setUTCHours(SLOT_HOUR_UTC[dto.slot], 0, 0, 0);
        await tx.viewing.create({
          data: {
            propertyId: property.id,
            leadId: l.id,
            customerId: l.customerId,
            agentId: property.agentId,
            scheduledAt: at,
            notes: dto.notes || null,
          },
        });
      }
      await this.audit.record(
        {
          action: 'lead.create',
          entityType: 'lead',
          entityId: l.id,
          after: { number, type: l.type, source: 'website' },
        },
        tx,
      );
      return l;
    });

    this.events.emit('lead.created', { id: lead.id, number: lead.number, assignedToId: lead.assignedToId });
    if (dto.type === 'viewing') this.events.emit('viewing.requested', { leadId: lead.id, propertyId: property?.id });
    const result = { id: lead.id, number: lead.number };
    if (idemKey) await this.redis.set(idemKey, JSON.stringify(result), 'EX', 24 * 3600);
    return result;
  }
}
