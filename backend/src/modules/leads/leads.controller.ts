import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RecentAuth, Staff } from '../../common/auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ActivityDto, AssignDto, LeadsQueryDto, ManualLeadDto, StageDto, UpdateLeadDto } from './dto';
import { LeadsService } from './leads.service';

/** docs/02 §6 Leads [leads.*]; agents are limited to leads assigned to them. */
@ApiTags('admin/leads')
@Controller('admin/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** Leads table with filters (stage, type, source, assignee, period, search); agents see assigned leads only. */
  @Staff('leads.view')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: LeadsQueryDto) {
    return this.leads.list(user, q);
  }

  /** Kanban board: the newest 50 leads of each stage and each column's total. */
  @Staff('leads.view')
  @Get('board')
  board(@CurrentUser() user: AuthUser, @Query() q: LeadsQueryDto) {
    return this.leads.board(user, q);
  }

  /** PII export: re-authentication required (docs/03 §1 "data export"). */
  @Staff('leads.view')
  @RecentAuth()
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() user: AuthUser, @Query() q: LeadsQueryDto) {
    return this.leads.exportCsv(user, q);
  }

  /** Manual lead (phone call, WhatsApp, office visit); agents create leads for themselves. */
  @Staff('leads.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() b: ManualLeadDto) {
    return this.leads.create(user, b);
  }

  /** Lead details with property, customer, viewings and the activity timeline. */
  @Staff('leads.view')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.get(user, id);
  }

  /** Edit a lead's contact details, message or property (audited). */
  @Staff('leads.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: UpdateLeadDto) {
    return this.leads.update(user, id, b);
  }

  /** Move a lead to another stage (`lost` requires a reason); audited, notifies the assignee. */
  @Staff('leads.manage')
  @HttpCode(200)
  @Post(':id/stage')
  stage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: StageDto) {
    return this.leads.changeStage(user, id, b.stage, b.lostReason);
  }

  /** Assign or unassign a lead; audited, notifies the new assignee. */
  @Staff('leads.assign')
  @HttpCode(200)
  @Post(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: AssignDto) {
    return this.leads.assign(user, id, b.assignedToId);
  }

  /** Add a note or a contact log (call, WhatsApp, email); a first contact moves a new lead to contacted. */
  @Staff('leads.manage')
  @Post(':id/activities')
  activity(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: ActivityDto) {
    return this.leads.addActivity(user, id, b.type, b.body);
  }

  /** Link the lead to the matching customer account, or create one. */
  @Staff('leads.manage')
  @HttpCode(200)
  @Post(':id/customer')
  linkCustomer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.linkCustomer(user, id);
  }
}
