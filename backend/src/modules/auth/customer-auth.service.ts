import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { PasswordService } from './password.service.js';
import { TokensService } from './tokens.service.js';
import { OtpService } from './otp.service.js';
import type { AuthUser } from './auth-user.js';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface CustomerView {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  customer: CustomerView;
  isNew: boolean;
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly password: PasswordService,
    private readonly tenant: TenantContext,
  ) {}

  otpSend(channel: 'email' | 'sms', destination: string): Promise<void> {
    return this.otp.send(channel, destination);
  }

  async otpVerify(destination: string, code: string, name: string | undefined, meta: Meta): Promise<Session> {
    const tenantId = this.tenant.requireTenantId();
    if (!(await this.otp.verify(destination, code))) {
      throw new UnauthorizedException('رمز غير صحيح أو منتهٍ');
    }
    const isEmail = destination.includes('@');
    const where = isEmail ? { email: destination } : { phone: destination };
    let customer = await this.prisma.customer.findFirst({ where: { tenantId, ...where } });
    let isNew = false;

    if (!customer) {
      if (!name) throw new BadRequestException('الاسم مطلوب لإنشاء حساب جديد');
      customer = await this.prisma.customer.create({
        data: {
          tenantId,
          name,
          ...(isEmail
            ? { email: destination, emailVerifiedAt: new Date() }
            : { phone: destination, phoneVerifiedAt: new Date() }),
          consentAt: new Date(),
        },
      });
      isNew = true;
    } else {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          lastLoginAt: new Date(),
          ...(isEmail
            ? { emailVerifiedAt: customer.emailVerifiedAt ?? new Date() }
            : { phoneVerifiedAt: customer.phoneVerifiedAt ?? new Date() }),
        },
      });
    }

    return { ...(await this.issueSession(customer.id, tenantId, meta)), isNew };
  }

  async passwordLogin(email: string, plain: string, meta: Meta): Promise<Omit<Session, 'isNew'>> {
    const tenantId = this.tenant.requireTenantId();
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, email } });
    if (!customer?.passwordHash || !(await this.password.verify(customer.passwordHash, plain))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    await this.prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(customer.id, tenantId, meta);
  }

  async signAccessFor(customerId: string, tenantId: string | null): Promise<string> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new UnauthorizedException();
    return this.tokens.signAccess({ sub: customer.id, typ: 'customer', tid: tenantId });
  }

  async me(customerId: string): Promise<CustomerView> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new UnauthorizedException();
    return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone };
  }

  private async issueSession(
    customerId: string,
    tenantId: string,
    meta: Meta,
  ): Promise<Omit<Session, 'isNew'>> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new UnauthorizedException();
    const user: AuthUser = { sub: customer.id, typ: 'customer', tid: tenantId };
    const accessToken = this.tokens.signAccess(user);
    const refreshToken = await this.tokens.issueRefresh('customer', customer.id, tenantId, meta);
    return {
      accessToken,
      refreshToken,
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    };
  }
}
