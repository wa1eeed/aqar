import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Authenticated, Customer, CurrentUser, Staff } from '../../common/auth/decorators';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RequireCsrfHeader } from '../../common/security/csrf.guard';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import { clearRefreshCookie, clientMeta, readRefreshCookie, setRefreshCookie } from './cookies';
import { CustomerAuthService } from './customer-auth.service';
import {
  AcceptInviteDto,
  ChallengeCodeDto,
  ChallengeDto,
  ChallengePasswordDto,
  ChangePasswordDto,
  CodeDto,
  CustomerPasswordLoginDto,
  ForgotDto,
  OtpSendDto,
  OtpVerifyDto,
  ReauthDto,
  RefreshDto,
  RegisterDto,
  ResetDto,
  SetPasswordDto,
  StaffLoginDto,
} from './dto';
import { SessionService } from './session.service';
import { StaffAuthService, type IssuedSession, type LoginResult } from './staff-auth.service';

const IP_15MIN = (name: string, limit: number) => ({
  name,
  limit,
  windowSec: 900,
  by: 'ip' as const,
  failClosed: true,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly staff: StaffAuthService,
    private readonly customers: CustomerAuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.secureCookies = env.PUBLIC_URL.startsWith('https://');
  }

  private respond(res: Response, s: IssuedSession) {
    setRefreshCookie(res, s.user.typ, s.refresh.token, s.refresh.expiresAt, this.secureCookies);
    res.setHeader('Cache-Control', 'no-store');
    return { accessToken: s.accessToken, expiresIn: s.expiresIn };
  }

  private loginResponse(res: Response, r: LoginResult) {
    if (r.done) return this.respond(res, r.session);
    res.setHeader('Cache-Control', 'no-store');
    return { twoFactorRequired: r.next === 'totp', next: r.next, challengeId: r.challengeId };
  }

  // ───────────────────────────── staff ─────────────────────────────

  @Public()
  @RateLimit(IP_15MIN('staff-login', 10))
  @Post('staff/login')
  @HttpCode(200)
  async staffLogin(@Body() body: StaffLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.loginResponse(res, await this.staff.login(body.email, body.password, clientMeta(req)));
  }

  @Public()
  @RateLimit(IP_15MIN('staff-2fa', 20))
  @Post('staff/2fa')
  @HttpCode(200)
  async staff2fa(@Body() body: ChallengeCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.loginResponse(res, await this.staff.verifySecondFactor(body.challengeId, body.code, clientMeta(req)));
  }

  @Public()
  @RateLimit(IP_15MIN('staff-2fa', 20))
  @Post('staff/password/initial')
  @HttpCode(200)
  async staffInitialPassword(
    @Body() body: ChallengePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.loginResponse(
      res,
      await this.staff.initialPasswordChange(body.challengeId, body.newPassword, clientMeta(req)),
    );
  }

  @Public()
  @RateLimit(IP_15MIN('staff-2fa', 20))
  @Post('staff/2fa/setup')
  @HttpCode(200)
  async staff2faSetup(@Body() body: ChallengeDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.staff.totpSetupStart(body.challengeId);
  }

  @Public()
  @RateLimit(IP_15MIN('staff-2fa', 20))
  @Post('staff/2fa/enable')
  @HttpCode(200)
  async staff2faEnable(@Body() body: ChallengeCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { recoveryCodes, result } = await this.staff.totpSetupConfirm(body.challengeId, body.code, clientMeta(req));
    return { recoveryCodes, ...this.loginResponse(res, result) };
  }

  @Public()
  @RateLimit(
    { name: 'forgot-email', limit: 5, windowSec: 3600, by: 'body:email' },
    { name: 'forgot-ip', limit: 20, windowSec: 3600, by: 'ip' },
  )
  @Post('staff/password/forgot')
  @HttpCode(204)
  async forgot(@Body() body: ForgotDto): Promise<void> {
    await this.staff.forgotPassword(body.email);
  }

  @Public()
  @RateLimit({ name: 'reset', limit: 10, windowSec: 3600, by: 'ip' })
  @Post('staff/password/reset')
  @HttpCode(204)
  async reset(@Body() body: ResetDto): Promise<void> {
    await this.staff.resetPassword(body.token, body.newPassword);
  }

  @Public()
  @RateLimit({ name: 'invite-accept', limit: 10, windowSec: 3600, by: 'ip' })
  @Post('staff/invite/accept')
  @HttpCode(204)
  async acceptInvite(@Body() body: AcceptInviteDto): Promise<void> {
    await this.staff.acceptInvite(body.token, body.password);
  }

  @Staff()
  @RateLimit(IP_15MIN('reauth', 10))
  @Post('staff/reauth')
  @HttpCode(200)
  reauth(@CurrentUser() user: AuthUser, @Body() body: ReauthDto) {
    return this.staff.reauth(user, body);
  }

  @Staff()
  @RateLimit(IP_15MIN('password-change', 10))
  @Post('staff/password/change')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto): Promise<void> {
    await this.staff.changePassword(user, body.currentPassword, body.newPassword);
  }

  @Staff()
  @Post('staff/me/2fa/setup')
  @HttpCode(200)
  selfTotpSetup(@CurrentUser() user: AuthUser) {
    return this.staff.selfTotpStart(user);
  }

  @Staff()
  @RateLimit(IP_15MIN('staff-2fa', 20))
  @Post('staff/me/2fa/enable')
  @HttpCode(200)
  selfTotpEnable(@CurrentUser() user: AuthUser, @Body() body: CodeDto) {
    return this.staff.selfTotpConfirm(user, body.code);
  }

  // ───────────────────────────── customer ─────────────────────────────

  @Public()
  @RateLimit(
    { name: 'otp-dest', limit: 5, windowSec: 3600, by: 'body:destination', failClosed: true },
    { name: 'otp-ip', limit: 20, windowSec: 3600, by: 'ip', failClosed: true },
  )
  @Post('customer/otp/send')
  @HttpCode(204)
  async otpSend(@Body() body: OtpSendDto): Promise<void> {
    await this.customers.sendOtp(body.channel, body.destination);
  }

  @Public()
  @RateLimit(
    { name: 'otp-verify-dest', limit: 10, windowSec: 3600, by: 'body:destination', failClosed: true },
    IP_15MIN('otp-verify-ip', 30),
  )
  @Post('customer/otp/verify')
  @HttpCode(200)
  async otpVerify(@Body() body: OtpVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { destination, code, ...profile } = body;
    const r = await this.customers.verifyOtp(destination, code, profile, clientMeta(req));
    if (!r.done) {
      res.setHeader('Cache-Control', 'no-store');
      return { isNew: true, profileRequired: true, registrationToken: r.registrationToken };
    }
    return { ...this.respond(res, r.session), customer: r.customer, isNew: r.isNew };
  }

  @Public()
  @RateLimit(IP_15MIN('register', 10))
  @Post('customer/register')
  @HttpCode(200)
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { registrationToken, ...profile } = body;
    const r = await this.customers.completeRegistration(registrationToken, profile, clientMeta(req));
    return { ...this.respond(res, r.session), customer: r.customer, isNew: true };
  }

  @Public()
  @RateLimit(IP_15MIN('customer-login', 10))
  @Post('customer/password/login')
  @HttpCode(200)
  async customerPasswordLogin(
    @Body() body: CustomerPasswordLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.customers.passwordLogin(body.email, body.password, clientMeta(req));
    return { ...this.respond(res, r.session), customer: r.customer, isNew: false };
  }

  @Customer()
  @Post('customer/password/set')
  @HttpCode(204)
  async customerSetPassword(@CurrentUser() user: AuthUser, @Body() body: SetPasswordDto): Promise<void> {
    await this.customers.setPassword(user, body.newPassword);
  }

  // ───────────────────────────── both ─────────────────────────────

  @Public()
  @RequireCsrfHeader()
  @RateLimit({ name: 'refresh', limit: 60, windowSec: 60, by: 'ip' })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const typ = body.audience;
    const token = readRefreshCookie(req, typ);
    if (!token) throw new AppException('SESSION_EXPIRED', 401, 'انتهت الجلسة، سجّل الدخول من جديد');
    try {
      const s =
        typ === 'staff'
          ? await this.staff.refresh(token, clientMeta(req))
          : await this.customers.refresh(token, clientMeta(req));
      return this.respond(res, s);
    } catch (e) {
      clearRefreshCookie(res, typ, this.secureCookies);
      throw e;
    }
  }

  @Public()
  @RequireCsrfHeader()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = readRefreshCookie(req, body.audience);
    if (token) await this.sessions.revokeByToken(body.audience, token);
    clearRefreshCookie(res, body.audience, this.secureCookies);
  }

  @Authenticated()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    if (user.typ === 'customer') {
      const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: user.id } });
      return { typ: 'customer', customer: CustomerAuthService.profile(c) };
    }
    const s = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: user.id }, include: { role: true } });
    return {
      typ: 'staff',
      staff: {
        id: s.id,
        name: s.name,
        email: s.email,
        title: s.title,
        avatarKey: s.avatarKey,
        totpEnabled: s.totpEnabled,
        recoveryCodesLeft: s.totpRecoveryCodes.length,
        role: { key: s.role.key, nameAr: s.role.nameAr },
      },
      permissions: user.perms,
      scope: user.scope,
      reauthUntil: user.authTime + 600,
    };
  }
}
