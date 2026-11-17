import { applyDecorators, createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../../modules/auth/auth.types';
import type { Permission } from './permissions';

export const AUDIENCE = 'nx:audience';
export const PERMS = 'nx:perms';
export const RECENT_AUTH = 'nx:recentAuth';

export type RouteAudience = 'staff' | 'customer' | 'any';

/** Staff route; every listed permission is required (docs/03 §3). */
export const Staff = (...perms: Permission[]) =>
  applyDecorators(SetMetadata(AUDIENCE, 'staff'), SetMetadata(PERMS, perms));

/** Customer route (`/me/*`). Customers never reach staff routes. */
export const Customer = () => SetMetadata(AUDIENCE, 'customer');

/** Any authenticated subject (e.g. `/auth/me`). */
export const Authenticated = () => SetMetadata(AUDIENCE, 'any');

/** Requires a password/TOTP check within the last 10 minutes (docs/03 §1). */
export const RecentAuth = () => SetMetadata(RECENT_AUTH, true);

/** Optional on @Public routes: the subject when a valid token was sent. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
});
