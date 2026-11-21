import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { TotpService } from '../src/modules/auth/totp.service.js';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard.js';
import { PERMISSIONS_KEY, PLATFORM_KEY, STAFF_KEY } from '../src/modules/auth/decorators.js';
import type { AuthUser } from '../src/modules/auth/auth-user.js';

describe('PasswordService', () => {
  it('hash ثم verify يعمل، وكلمة خاطئة تفشل', async () => {
    const svc = new PasswordService();
    const hash = await svc.hash('S3cret!pass');
    expect(await svc.verify(hash, 'S3cret!pass')).toBe(true);
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });
});

describe('TotpService', () => {
  it('سرّ صالح + رمز حالي يُقبل', () => {
    const svc = new TotpService();
    const secret = svc.generateSecret();
    expect(svc.verify(authenticator.generate(secret), secret)).toBe(true);
    expect(svc.verify('000000', secret)).toBe(false);
    expect(svc.keyUri('user@x.com', secret)).toContain('otpauth://');
  });
});

function makeCtx(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeReflector(meta: { perms?: string[]; platform?: boolean; staff?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === PERMISSIONS_KEY ? meta.perms : key === PLATFORM_KEY ? meta.platform : key === STAFF_KEY ? meta.staff : undefined,
  } as unknown as Reflector;
}

describe('PermissionsGuard', () => {
  const staff: AuthUser = { sub: 's1', typ: 'staff', tid: 't1', perms: ['settings.general', 'dashboard.view'] };
  const customer: AuthUser = { sub: 'c1', typ: 'customer', tid: 't1' };
  const platform: AuthUser = { sub: 'p1', typ: 'platform', tid: null };

  it('بلا بيانات وصفية → يسمح', () => {
    const g = new PermissionsGuard(makeReflector({}));
    expect(g.canActivate(makeCtx(staff))).toBe(true);
  });

  it('صلاحية موجودة تُقبل، وناقصة تُرفض', () => {
    expect(new PermissionsGuard(makeReflector({ perms: ['settings.general'] })).canActivate(makeCtx(staff))).toBe(true);
    expect(() =>
      new PermissionsGuard(makeReflector({ perms: ['settings.payments'] })).canActivate(makeCtx(staff)),
    ).toThrow(ForbiddenException);
  });

  it('مسار المنصّة يرفض الموظف ويقبل السوبر-أدمن', () => {
    expect(() => new PermissionsGuard(makeReflector({ platform: true })).canActivate(makeCtx(staff))).toThrow(
      ForbiddenException,
    );
    expect(new PermissionsGuard(makeReflector({ platform: true })).canActivate(makeCtx(platform))).toBe(true);
  });

  it('مسار الموظف يرفض العميل', () => {
    expect(() => new PermissionsGuard(makeReflector({ staff: true })).canActivate(makeCtx(customer))).toThrow(
      ForbiddenException,
    );
  });
});
