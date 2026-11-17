import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import { REAUTH_WINDOW_SEC, type AuthUser } from '../auth/auth.types';
import { isSettingsKey, SETTINGS_KEYS, SETTINGS_SECTIONS, type SettingsKey } from './schemas';
import { SettingsService } from './settings.service';

/** Sections whose changes need a fresh password/TOTP check (docs/03 §1: payment settings). */
const SENSITIVE: SettingsKey[] = ['booking', 'payments', 'bank_transfer'];

/** docs/02 §6 Settings: GET /admin/settings, GET/PUT /admin/settings/:section [settings.<section>]. */
@ApiTags('admin/settings')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  private section(user: AuthUser, key: string): SettingsKey {
    if (!isSettingsKey(key)) throw new AppException('NOT_FOUND', 404, 'القسم غير موجود');
    if (!user.perms.includes(SETTINGS_SECTIONS[key].permission)) {
      throw new AppException('FORBIDDEN', 403, 'ليست لديك صلاحية لتنفيذ هذا الإجراء');
    }
    return key;
  }

  /** All settings sections the caller may edit, with current values. */
  @Staff()
  @Get()
  async all(@CurrentUser() user: AuthUser) {
    const allowed = SETTINGS_KEYS.filter((k) => user.perms.includes(SETTINGS_SECTIONS[k].permission));
    const entries = await Promise.all(allowed.map(async (k) => [k, await this.settings.get(k)] as const));
    return { sections: Object.fromEntries(entries) };
  }

  /** One settings section (current value, defaults applied). */
  @Staff()
  @Get(':section')
  get(@CurrentUser() user: AuthUser, @Param('section') key: string) {
    return this.settings.get(this.section(user, key));
  }

  /** Replace a settings section (validated by its zod schema, audited, cache invalidated). */
  @Staff()
  @Put(':section')
  put(@CurrentUser() user: AuthUser, @Param('section') key: string, @Body() body: unknown) {
    const section = this.section(user, key);
    if (SENSITIVE.includes(section) && Date.now() / 1000 - user.authTime > REAUTH_WINDOW_SEC) {
      throw new AppException('REAUTH_REQUIRED', 401, 'يلزم تأكيد هويتك مرة أخرى لإتمام هذا الإجراء');
    }
    return this.settings.update(section, body, user.id);
  }
}
