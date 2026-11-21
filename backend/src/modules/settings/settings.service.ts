import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import {
  SETTINGS_SCHEMAS,
  SETTINGS_SECTION_KEYS,
  defaultFor,
  isSettingsSectionKey,
  type SettingsSectionKey,
} from './schemas/index.js';
import { checkBrandingContrast } from '../theme/contrast.js';

interface Actor {
  id?: string | null;
  perms?: string[];
  ip?: string | null;
  userAgent?: string | null;
}

// الصلاحية المطلوبة لتعديل كل قسم (docs/03 §3).
const SECTION_PERMISSION: Record<SettingsSectionKey, string> = {
  general: 'settings.general',
  branding: 'settings.branding',
  contact: 'settings.contact',
  legal: 'settings.legal',
  licensing: 'settings.licensing',
  booking: 'settings.booking',
  payments: 'settings.payments',
  bank_transfer: 'settings.payments',
  notifications: 'settings.notifications',
  maps: 'settings.maps',
  features: 'settings.features',
  locations: 'settings.locations',
  seo: 'seo.manage',
};

// الإعدادات لكل مشترك (SettingsSection بمفتاح مركّب [tenantId, key]).
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantContext,
  ) {}

  /** يقرأ قيمة قسم للمشترك الحالي؛ يعيد الافتراضي إذا لم يُحفظ بعد. */
  async get(key: SettingsSectionKey): Promise<unknown> {
    const tenantId = this.tenant.requireTenantId();
    const row = await this.prisma.settingsSection.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!row) return defaultFor(key);
    return SETTINGS_SCHEMAS[key].parse(row.value);
  }

  /** يقرأ كل الأقسام للمشترك الحالي. */
  async getAll(): Promise<Record<SettingsSectionKey, unknown>> {
    const tenantId = this.tenant.requireTenantId();
    const rows = await this.prisma.settingsSection.findMany({ where: { tenantId } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const out = {} as Record<SettingsSectionKey, unknown>;
    for (const key of SETTINGS_SECTION_KEYS) {
      const raw = byKey.get(key);
      out[key] = raw === undefined ? defaultFor(key) : SETTINGS_SCHEMAS[key].parse(raw);
    }
    return out;
  }

  /** يتحقّق من القيمة ويحفظها للمشترك الحالي، ويكتب سجلّ تدقيق. */
  async update(keyRaw: string, value: unknown, actor: Actor = {}): Promise<unknown> {
    if (!isSettingsSectionKey(keyRaw)) throw new NotFoundException(`قسم إعدادات غير معروف: ${keyRaw}`);
    const key = keyRaw;
    if (actor.perms && !actor.perms.includes(SECTION_PERMISSION[key])) {
      throw new ForbiddenException(`يتطلّب صلاحية ${SECTION_PERMISSION[key]}`);
    }
    const tenantId = this.tenant.requireTenantId();
    const parsed = SETTINGS_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'فشل التحقّق من الإعدادات',
        errors: parsed.error.flatten(),
      });
    }

    // حارس تباين الهوية (docs/07 §10.1): يُحجب الحفظ ما لم يُمرَّر allowLowContrast
    if (key === 'branding') {
      const colors = (parsed.data as { colors: Record<string, string> }).colors;
      const failures = checkBrandingContrast(colors);
      const override = (value as { allowLowContrast?: boolean })?.allowLowContrast === true;
      if (failures.length && !override) {
        throw new BadRequestException({ message: 'تباين ألوان غير كافٍ (WCAG 4.5:1)', code: 'CONTRAST_TOO_LOW', failures });
      }
    }

    const before = await this.prisma.settingsSection.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    const saved = await this.prisma.settingsSection.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: parsed.data as object, updatedById: actor.id ?? null },
      update: { value: parsed.data as object, updatedById: actor.id ?? null },
    });

    await this.audit.record({
      tenantId,
      actorType: 'staff',
      actorId: actor.id ?? null,
      action: 'settings.update',
      entityType: 'SettingsSection',
      entityId: key,
      before: before?.value,
      after: saved.value,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return saved.value;
  }
}
