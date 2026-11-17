import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { SubjectType } from '@prisma/client';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { RealtimeService } from '../realtime/realtime.service';
import { CUSTOMER_REFRESH_TTL_SEC, STAFF_REFRESH_TTL_SEC, type Audience } from './auth.types';
import { KeyedHashService } from './keyed-hash.service';

export type RotateResult =
  | { ok: true; subjectId: string; family: string; token: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' };

const MIN_IAT_TTL_SEC = 24 * 3600; // > access token lifetime

/**
 * Refresh tokens (docs/03 §1): opaque random values stored only as keyed hashes, rotated on every
 * use. Presenting an already-rotated token means it was stolen → the whole family is revoked and
 * `security.session_revoked` is emitted. Access tokens issued before a revocation are rejected via a
 * per-subject "minimum iat" kept in Redis.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: KeyedHashService,
    private readonly events: EventEmitter2,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly realtime: RealtimeService,
  ) {}

  private ttl(typ: Audience): number {
    return typ === 'staff' ? STAFF_REFRESH_TTL_SEC : CUSTOMER_REFRESH_TTL_SEC;
  }

  async issue(
    typ: Audience,
    subjectId: string,
    meta: { ip: string | null; userAgent: string | null },
    family = randomBytes(16).toString('hex'),
  ): Promise<{ token: string; family: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttl(typ) * 1000);
    await this.prisma.refreshToken.create({
      data: {
        subjectType: typ as SubjectType,
        subjectId,
        tokenHash: this.hasher.hash('refresh-token', token),
        family,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        expiresAt,
      },
    });
    return { token, family, expiresAt };
  }

  async rotate(
    typ: Audience,
    token: string,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<RotateResult> {
    const tokenHash = this.hasher.hash('refresh-token', token);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!row || row.subjectType !== typ) return { ok: false, reason: 'invalid' };

    if (row.revokedAt) {
      await this.revokeFamily(row.family);
      await this.revokeAccessTokens(typ, row.subjectId);
      this.events.emit('security.session_revoked', {
        recipientType: typ,
        recipientId: row.subjectId,
        reason: 'refresh_reuse',
      });
      return { ok: false, reason: 'reused' };
    }
    if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

    // Atomic claim: only one concurrent request can rotate this token.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return { ok: false, reason: 'reused' };

    const next = await this.issue(typ, row.subjectId, meta, row.family);
    return { ok: true, subjectId: row.subjectId, family: row.family, token: next.token, expiresAt: next.expiresAt };
  }

  async revokeFamily(family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { family, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeByToken(typ: Audience, token: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hasher.hash('refresh-token', token) },
    });
    if (row && row.subjectType === typ) await this.revokeFamily(row.family);
  }

  /** Ends every session of a subject (password reset, deactivation, role change, 2FA reset). */
  async revokeAll(typ: Audience, subjectId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { subjectType: typ as SubjectType, subjectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.revokeAccessTokens(typ, subjectId);
    this.realtime.disconnect(typ, subjectId);
  }

  private async revokeAccessTokens(typ: Audience, subjectId: string): Promise<void> {
    await this.redis.set(`auth:min-iat:${typ}:${subjectId}`, String(Date.now()), 'EX', MIN_IAT_TTL_SEC);
  }

  /** Access tokens issued at or before the last revocation are invalid. */
  async isAccessTokenRevoked(typ: Audience, subjectId: string, iatMs: number): Promise<boolean> {
    const minIat = await this.redis.get(`auth:min-iat:${typ}:${subjectId}`);
    return minIat !== null && iatMs <= Number(minIat);
  }
}
