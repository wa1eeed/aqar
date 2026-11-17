import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ACCESS_TTL_SEC, type Audience, type AuthUser } from './auth.types';

const ISSUER = 'nx';

interface Claims {
  typ: Audience;
  role: string | null;
  perms: string[];
  scope: 'all' | 'own';
  auth_time: number;
  sid: string;
  /** Issue time in ms — revocation checks need sub-second precision. */
  iat_ms: number;
}

/** HS256 access tokens, 15 minutes (docs/02 §1: sub, typ, role, perms, exp). */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Pick<Env, 'JWT_ACCESS_SECRET'>) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async sign(user: AuthUser): Promise<{ accessToken: string; expiresIn: number }> {
    const claims: Claims = {
      typ: user.typ,
      role: user.role,
      perms: user.perms,
      scope: user.scope,
      auth_time: user.authTime,
      sid: user.sid,
      iat_ms: Date.now(),
    };
    const accessToken = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(`nx-${user.typ}`)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SEC}s`)
      .sign(this.key);
    return { accessToken, expiresIn: ACCESS_TTL_SEC };
  }

  /** Returns the subject and issue time, or null for any invalid/expired/foreign token. */
  async verify(token: string): Promise<{ user: AuthUser; iatMs: number } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: ['nx-staff', 'nx-customer'],
        algorithms: ['HS256'],
      });
      const p = payload as unknown as Claims & { sub?: string; iat?: number; aud?: string };
      if (!p.sub || (p.typ !== 'staff' && p.typ !== 'customer') || p.aud !== `nx-${p.typ}`) return null;
      return {
        iatMs: Number(p.iat_ms) || (p.iat ?? 0) * 1000,
        user: {
          typ: p.typ,
          id: p.sub,
          role: p.role ?? null,
          perms: Array.isArray(p.perms) ? p.perms : [],
          scope: p.scope === 'own' ? 'own' : 'all',
          authTime: Number(p.auth_time) || 0,
          sid: String(p.sid ?? ''),
        },
      };
    } catch (e) {
      if (e instanceof joseErrors.JOSEError) return null;
      throw e;
    }
  }
}
