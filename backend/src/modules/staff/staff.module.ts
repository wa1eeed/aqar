import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StaffService } from './staff.service.js';
import { StaffController } from './staff.controller.js';
import { RolesService } from '../roles/roles.service.js';
import { RolesController } from '../roles/roles.controller.js';

// إدارة الهوية داخل المكتب: الموظفون والأدوار.
@Module({
  imports: [AuthModule],
  providers: [StaffService, RolesService],
  controllers: [StaffController, RolesController],
})
export class StaffModule {}
