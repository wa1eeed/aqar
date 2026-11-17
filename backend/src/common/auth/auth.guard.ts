import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { requestContext } from '../context/request-context';
import { AppException } from '../errors/app-exception';
import { AccessTokenService } from '../../modules/auth/access-token.service';
import { REAUTH_WINDOW_SEC, type AuthUser } from '../../modules/auth/auth.types';
import { SessionService } from '../../modules/auth/session.service';
import { AUDIENCE, PERMS, RECENT_AUTH, type RouteAudience } from './decorators';
import { IS_PUBLIC } from './public.decorator';

const unauthenticated = () => new AppException('UNAUTHENTICATED', 401, 'يلزم تسجيل الدخول');
const forbidden = () => new AppException('FORBIDDEN', 403, 'ليست لديك صلاحية لتنفيذ هذا الإجراء');

/**
 * Global default-deny guard. A route is reachable only if it declares @Public, @Staff(perms),
 * @Customer or @Authenticated. Tokens are verified (signature, issuer, audience, expiry) and checked
 * against server-side revocation, so deactivation or a password reset takes effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  private async authenticate(req: Request): Promise<AuthUser | null> {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const verified = await this.tokens.verify(header.slice(7).trim());
    if (!verified) return null;
    if (await this.sessions.isAccessTokenRevoked(verified.user.typ, verified.user.id, verified.iatMs)) return null;
    return verified.user;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    if (this.meta<boolean>(IS_PUBLIC, ctx)) {
      // Optional identity on public routes (e.g. link a lead to a logged-in customer).
      const user = await this.authenticate(req).catch(() => null);
      if (user) this.attach(req, user);
      return true;
    }

    const audience = this.meta<RouteAudience>(AUDIENCE, ctx);
    const user = await this.authenticate(req);
    if (!user) throw unauthenticated();
    if (!audience) throw forbidden(); // undeclared route: never reachable

    if (audience !== 'any' && user.typ !== audience) throw forbidden();

    const perms = this.meta<string[]>(PERMS, ctx) ?? [];
    if (perms.some((p) => !user.perms.includes(p))) throw forbidden();

    if (this.meta<boolean>(RECENT_AUTH, ctx) && Date.now() / 1000 - user.authTime > REAUTH_WINDOW_SEC) {
      throw new AppException('REAUTH_REQUIRED', 401, 'يلزم تأكيد هويتك مرة أخرى لإتمام هذا الإجراء');
    }

    this.attach(req, user);
    return true;
  }

  private attach(req: Request & { user?: AuthUser }, user: AuthUser): void {
    req.user = user;
    requestContext.setActor({ type: user.typ, id: user.id });
  }
}
