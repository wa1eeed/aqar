import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import {
  SETTINGS_SCHEMAS,
  SETTINGS_SECTION_KEYS,
  defaultFor,
  isSettingsSectionKey,
  type SettingsSectionKey,
} from './schemas/index.js';

interface Actor {
  id?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** يقرأ قيمة قسم؛ يعيد الافتراضي إذا لم يُحفظ بعد. */
  async get(key: SettingsSectionKey): Promise<unknown> {
    const row = await this.prisma.settingsSection.findUnique({ where: { key } });
    if (!row) return defaultFor(key);
    // التحقق + دمج أي حقول ناقصة مع الافتراضيات
    return SETTINGS_SCHEMAS[key].parse(row.value);
  }

  /** يقرأ كل الأقسام. */
  async getAll(): Promise<Record<SettingsSectionKey, unknown>> {
    const rows = await this.prisma.settingsSection.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const out = {} as Record<SettingsSectionKey, unknown>;
    for (const key of SETTINGS_SECTION_KEYS) {
      const raw = byKey.get(key);
      out[key] = raw === undefined ? defaultFor(key) : SETTINGS_SCHEMAS[key].parse(raw);
    }
    return out;
  }

  /** يتحقّق من القيمة ويحفظها، ويكتب سجلّ تدقيق. */
  async update(keyRaw: string, value: unknown, actor: Actor = {}): Promise<unknown> {
    if (!isSettingsSectionKey(keyRaw)) throw new NotFoundException(`قسم إعدادات غير معروف: ${keyRaw}`);
    const key = keyRaw;
    const parsed = SETTINGS_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'فشل التحقّق من الإعدادات',
        errors: parsed.error.flatten(),
      });
    }

    const before = await this.prisma.settingsSection.findUnique({ where: { key } });
    const saved = await this.prisma.settingsSection.upsert({
      where: { key },
      create: { key, value: parsed.data as object, updatedById: actor.id ?? null },
      update: { value: parsed.data as object, updatedById: actor.id ?? null },
    });

    await this.audit.record({
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
