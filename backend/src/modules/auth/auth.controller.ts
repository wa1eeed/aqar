import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { StaffAuthService } from './staff-auth.service.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { TokensService } from './tokens.service.js';
import { CurrentUser, Public, RequirePlatform } from './decorators.js';
import type { AuthUser } from './auth-user.js';

const COOKIE = 'nx_rt';
const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 86_400_000,
};

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const twoFaSchema = z.object({ challengeId: z.string().min(1), code: z.string().min(4) });
const codeSchema = z.object({ code: z.string().min(4) });
const otpSendSchema = z.object({ channel: z.enum(['email', 'sms']), destination: z.string().min(3) });
const otpVerifySchema = z.object({ destination: z.string().min(3), code: z.string().min(4), name: z.string().optional() });

function meta(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly staff: StaffAuthService,
    private readonly platform: PlatformAuthService,
    private readonly customers: CustomerAuthService,
    private readonly tokens: TokensService,
  ) {}

  // ───────── الموظفون ─────────
  @Public()
  @Post('staff/login')
  @ApiOperation({ summary: 'تسجيل دخول موظف المكتب' })
  async staffLogin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    const result = await this.staff.login(email, password, meta(req));
    return this.finish(result, res);
  }

  @Public()
  @Post('staff/2fa')
  @ApiOperation({ summary: 'إكمال تسجيل الدخول بالتحقّق الثنائي' })
  async staff2fa(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { challengeId, code } = twoFaSchema.parse(body);
    return this.finish(await this.staff.verify2fa(challengeId, code, meta(req)), res);
  }

  @Post('staff/2fa/setup')
  @ApiOperation({ summary: 'بدء إعداد التحقّق الثنائي (موظف مسجَّل)' })
  staff2faSetup(@CurrentUser() user: AuthUser) {
    return this.staff.setup2fa(user.sub);
  }

  @Post('staff/2fa/enable')
  @ApiOperation({ summary: 'تفعيل التحقّق الثنائي' })
  staff2faEnable(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.staff.enable2fa(user.sub, codeSchema.parse(body).code);
  }

  // ───────── السوبر-أدمن ─────────
  @Public()
  @Post('platform/login')
  async platformLogin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    return this.finish(await this.platform.login(email, password, meta(req)), res);
  }

  @Public()
  @Post('platform/2fa')
  async platform2fa(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { challengeId, code } = twoFaSchema.parse(body);
    return this.finish(await this.platform.verify2fa(challengeId, code, meta(req)), res);
  }

  @RequirePlatform()
  @Post('platform/2fa/setup')
  platform2faSetup(@CurrentUser() user: AuthUser) {
    return this.platform.setup2fa(user.sub);
  }

  @RequirePlatform()
  @Post('platform/2fa/enable')
  platform2faEnable(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.platform.enable2fa(user.sub, codeSchema.parse(body).code);
  }

  // ───────── العملاء ─────────
  @Public()
  @Post('customer/otp/send')
  @HttpCode(204)
  async customerOtpSend(@Body() body: unknown) {
    const { channel, destination } = otpSendSchema.parse(body);
    await this.customers.otpSend(channel, destination);
  }

  @Public()
  @Post('customer/otp/verify')
  async customerOtpVerify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { destination, code, name } = otpVerifySchema.parse(body);
    const session = await this.customers.otpVerify(destination, code, name, meta(req));
    res.cookie(COOKIE, session.refreshToken, cookieOpts);
    return { accessToken: session.accessToken, customer: session.customer, isNew: session.isNew };
  }

  @Public()
  @Post('customer/password/login')
  async customerPasswordLogin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    const session = await this.customers.passwordLogin(email, password, meta(req));
    res.cookie(COOKIE, session.refreshToken, cookieOpts);
    return { accessToken: session.accessToken, customer: session.customer };
  }

  // ───────── مشترك: تحديث/خروج/أنا ─────────
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'تحديث رمز الوصول وتدوير رمز التحديث' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[COOKIE];
    if (!raw) throw new UnauthorizedException('لا يوجد رمز تحديث');
    const rotated = await this.tokens.rotate(raw, meta(req));
    res.cookie(COOKIE, rotated.raw, cookieOpts);
    let accessToken: string;
    if (rotated.subjectType === 'staff') accessToken = await this.staff.signAccessFor(rotated.subjectId);
    else if (rotated.subjectType === 'platform') accessToken = await this.platform.signAccessFor(rotated.subjectId);
    else accessToken = await this.customers.signAccessFor(rotated.subjectId, rotated.tenantId);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[COOKIE];
    if (raw) await this.tokens.revokeByToken(raw);
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
  }

  @Get('me')
  @ApiOperation({ summary: 'المستخدم الحالي' })
  me(@CurrentUser() user: AuthUser) {
    if (user.typ === 'staff') return this.staff.me(user.sub);
    if (user.typ === 'platform') return this.platform.me(user.sub);
    return this.customers.me(user.sub);
  }

  private finish(
    result: { twoFactorRequired: true; challengeId: string } | { accessToken: string; refreshToken: string; user: AuthUser },
    res: Response,
  ) {
    if ('twoFactorRequired' in result) return result;
    res.cookie(COOKIE, result.refreshToken, cookieOpts);
    return { accessToken: result.accessToken, user: result.user };
  }
}
