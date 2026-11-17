import type { Request, Response } from 'express';
import type { Audience } from './auth.types';

/** docs/02 §1: httpOnly refresh cookie, Secure, SameSite=Lax, Path=/api/v1/auth. One per audience so
 * a staff session and a customer session in the same browser never overwrite each other. */
export const REFRESH_COOKIE: Record<Audience, string> = { customer: 'nx_rt', staff: 'nx_srt' };
const PATH = '/api/v1/auth';

export function setRefreshCookie(res: Response, typ: Audience, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(REFRESH_COOKIE[typ], token, { httpOnly: true, secure, sameSite: 'lax', path: PATH, expires: expiresAt });
}

export function clearRefreshCookie(res: Response, typ: Audience, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE[typ], { httpOnly: true, secure, sameSite: 'lax', path: PATH });
}

export function readRefreshCookie(req: Request, typ: Audience): string | null {
  const v = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE[typ]];
  return typeof v === 'string' && v.length >= 20 && v.length <= 200 ? v : null;
}

export function clientMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null };
}
