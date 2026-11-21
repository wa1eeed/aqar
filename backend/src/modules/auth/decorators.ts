import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
/** يتجاوز حارس المصادقة (نقطة عامة). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'auth:permissions';
/** يتطلّب صلاحيات موظف (كلها مطلوبة). */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const PLATFORM_KEY = 'auth:platform';
/** يتطلّب مستخدم منصّة (سوبر-أدمن). */
export const RequirePlatform = () => SetMetadata(PLATFORM_KEY, true);

export const STAFF_KEY = 'auth:staff';
/** يتطلّب حساب موظف مكتب (دون صلاحية محدّدة). */
export const RequireStaff = () => SetMetadata(STAFF_KEY, true);

export const CUSTOMER_KEY = 'auth:customer';
/** يتطلّب حساب عميل (نقاط /me/*). */
export const RequireCustomer = () => SetMetadata(CUSTOMER_KEY, true);

/** يحقن المستخدم الحالي في معامل المتحكّم. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
