import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Customer, Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import { plainText } from '../../common/security/zod-helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { NotificationsService, TAB_PREFIXES } from './notifications.service';

const id = z.string().regex(/^[a-z0-9]{10,40}$/i);

class ListQuery extends createZodDto(
  z
    .object({
      unread: z.enum(['0', '1']).optional(),
      tab: z.enum(Object.keys(TAB_PREFIXES) as [string, ...string[]]).optional(),
      archived: z.enum(['0', '1']).optional(),
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict(),
) {}
class ReadDto extends createZodDto(
  z
    .object({ ids: z.array(id).min(1).max(100).optional(), all: z.literal(true).optional() })
    .strict()
    .refine((b) => !!b.ids !== !!b.all, 'ids_or_all'),
) {}
class ArchiveDto extends createZodDto(z.object({ ids: z.array(id).min(1).max(100) }).strict()) {}
const prefItem = z
  .object({ eventKey: z.string().max(60), inApp: z.boolean(), email: z.boolean(), sms: z.boolean() })
  .strict();
class PrefsDto extends createZodDto(z.object({ items: z.array(prefItem).min(1).max(60) }).strict()) {}
class BroadcastDto extends createZodDto(
  z
    .object({
      roles: z
        .array(z.string().regex(/^[a-z_]{2,40}$/))
        .min(1)
        .max(20),
      title: plainText(120).pipe(z.string().min(2)),
      body: plainText(1000).default(''),
    })
    .strict(),
) {}

const listArgs = (q: ListQuery) => ({
  unread: q.unread === '1',
  archived: q.archived === '1',
  page: q.page,
  pageSize: q.pageSize,
  ...(q.tab ? { tab: q.tab } : {}),
});

/** Admin notification center (docs/06 §2, docs/02 §6 Notifications). Every staff member has one. */
@ApiTags('admin/notifications')
@Controller('admin')
export class AdminNotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Staff()
  @Get('notifications')
  list(@CurrentUser() user: AuthUser, @Query() q: ListQuery) {
    return this.notifications.list(user, listArgs(q));
  }

  @Staff()
  @HttpCode(200)
  @Post('notifications/read')
  read(@CurrentUser() user: AuthUser, @Body() b: ReadDto) {
    return this.notifications.markRead(user, b);
  }

  @Staff()
  @HttpCode(200)
  @Post('notifications/archive')
  archive(@CurrentUser() user: AuthUser, @Body() b: ArchiveDto) {
    return this.notifications.archive(user, b.ids);
  }

  @Staff()
  @Get('notification-preferences')
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user);
  }

  @Staff()
  @Put('notification-preferences')
  setPrefs(@CurrentUser() user: AuthUser, @Body() b: PrefsDto) {
    return this.notifications.setPreferences(user, b.items);
  }

  /** «إرسال تنبيه للفريق» — in-app announcement to the selected roles (docs/07 §8). */
  @Staff('notifications.broadcast')
  @HttpCode(200)
  @Post('notifications/broadcast')
  async broadcast(@CurrentUser() user: AuthUser, @Body() b: BroadcastDto) {
    const roles = await this.prisma.role.findMany({ where: { key: { in: b.roles } }, select: { key: true } });
    if (roles.length !== new Set(b.roles).size) {
      throw new AppException('VALIDATION_FAILED', 400, 'البيانات المدخلة غير صحيحة', {
        fields: { roles: 'unknown_role' },
      });
    }
    const users = await this.prisma.staffUser.findMany({
      where: { isActive: true, deletedAt: null, role: { key: { in: b.roles } } },
      select: { id: true },
    });
    const sender = await this.prisma.staffUser.findUnique({ where: { id: user.id }, select: { name: true } });
    const broadcastId = `${user.id}:${Date.now()}`;
    await this.notifications.dispatch(
      'staff.broadcast',
      users.map((u) => ({ type: 'staff' as const, id: u.id })),
      { title: b.title, body: b.body || `من ${sender?.name ?? 'الإدارة'}`, data: { from: user.id } },
      { entityId: broadcastId },
    );
    await this.audit.record({
      action: 'notifications.broadcast',
      entityType: 'notification',
      entityId: broadcastId,
      after: { roles: b.roles, title: b.title, recipients: users.length },
    });
    return { recipients: users.length };
  }
}

/** Customer notification center (docs/02 §5). */
@ApiTags('me/notifications')
@Controller('me')
export class MeNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Customer()
  @Get('notifications')
  list(@CurrentUser() user: AuthUser, @Query() q: ListQuery) {
    return this.notifications.list(user, listArgs(q));
  }

  @Customer()
  @HttpCode(200)
  @Post('notifications/read')
  read(@CurrentUser() user: AuthUser, @Body() b: ReadDto) {
    return this.notifications.markRead(user, b);
  }

  @Customer()
  @HttpCode(200)
  @Post('notifications/archive')
  archive(@CurrentUser() user: AuthUser, @Body() b: ArchiveDto) {
    return this.notifications.archive(user, b.ids);
  }

  @Customer()
  @Get('notification-preferences')
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user);
  }

  @Customer()
  @Put('notification-preferences')
  setPrefs(@CurrentUser() user: AuthUser, @Body() b: PrefsDto) {
    return this.notifications.setPreferences(user, b.items);
  }
}
