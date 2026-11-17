import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RecentAuth, Staff } from '../../common/auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { CreateRoleDto, InviteStaffDto, UpdateRoleDto, UpdateStaffDto } from './dto';
import { StaffService } from './staff.service';

/** docs/02 §6 Staff: staff.manage / roles.manage; staff and role changes need re-auth (docs/03 §1). */
@ApiTags('admin/staff')
@Controller('admin')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Team members with role, 2FA state, invitation state and last login. */
  @Staff('staff.manage')
  @Get('staff')
  list() {
    return this.staff.list();
  }

  /** Invite a staff member (creates the account and emails a 72-hour invitation link). */
  @Staff('staff.manage')
  @RecentAuth()
  @Post('staff')
  invite(@CurrentUser() user: AuthUser, @Body() body: InviteStaffDto) {
    return this.staff.invite(user, body);
  }

  /** Update a staff member (profile, role, active flag); the last owner cannot be removed. */
  @Staff('staff.manage')
  @RecentAuth()
  @Patch('staff/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateStaffDto) {
    return this.staff.update(user, id, body);
  }

  /** Reset a staff member's 2FA (they must set it up again; sessions end). */
  @Staff('staff.manage')
  @RecentAuth()
  @Post('staff/:id/reset-2fa')
  @HttpCode(204)
  async reset2fa(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.staff.reset2fa(user, id);
  }

  /** Send a new invitation link (the previous one stops working). */
  @Staff('staff.manage')
  @Post('staff/:id/resend-invite')
  @HttpCode(204)
  async resendInvite(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.staff.resendInvite(user, id);
  }

  /** System and custom roles with their permissions. */
  @Staff('roles.manage')
  @Get('roles')
  roles() {
    return this.staff.listRoles();
  }

  /** Create a custom role. */
  @Staff('roles.manage')
  @RecentAuth()
  @Post('roles')
  createRole(@Body() body: CreateRoleDto) {
    return this.staff.createRole(body);
  }

  /** Update a custom role (system roles are read-only). */
  @Staff('roles.manage')
  @RecentAuth()
  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.staff.updateRole(id, body);
  }
}
