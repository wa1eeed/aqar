import { Inject } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenService } from '../auth/access-token.service';
import type { AuthUser } from '../auth/auth.types';
import { SessionService } from '../auth/session.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rooms } from './realtime.service';

const MAX_PROPERTY_ROOMS = 30;
const idSchema = z.object({ id: z.number().int().min(1).max(2_147_483_647) }).strict();
const readSchema = z.object({ ids: z.array(z.string().max(40)).min(1).max(100) }).strict();

interface SocketData {
  user?: AuthUser;
  propertyRooms: Set<string>;
  expiry?: NodeJS.Timeout;
}

/**
 * Socket.IO at `/ws` (docs/02 §9). Anonymous sockets join `public`; a valid access token in
 * `handshake.auth.token` adds `customer:{id}` or `staff`, `staff:{id}`, `role:{key}`. The socket is
 * dropped when its access token expires (the client reconnects with a fresh token), so a revoked
 * session never keeps a live channel for more than the token lifetime; revocation also disconnects
 * immediately through RealtimeService.disconnect. Only the events listed below are accepted.
 */
@WebSocketGateway({
  path: '/ws',
  serveClient: true,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  afterInit(server: Server): void {
    const allowedOrigin = new URL(this.env.PUBLIC_URL).origin;
    // Cross-site WebSocket hijacking guard: browsers always send Origin; only our own site may connect.
    server.engine.opts.allowRequest = (req, cb) => {
      const origin = req.headers.origin;
      if (origin && this.env.NODE_ENV !== 'development' && this.env.NODE_ENV !== 'test' && origin !== allowedOrigin) {
        cb('origin not allowed', false);
        return;
      }
      cb(null, true);
    };
  }

  private ip(client: Socket): string {
    const fwd = client.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    return first || client.handshake.address || 'unknown';
  }

  async handleConnection(client: Socket): Promise<void> {
    const data: SocketData = { propertyRooms: new Set() };
    client.data = data;
    const rl = await this.rateLimit.hit(`ws:${this.ip(client)}`, 60, 60).catch(() => null);
    if (rl && !rl.allowed) {
      client.disconnect(true);
      return;
    }
    await client.join(rooms.public);

    const token = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token === 'string' && token.length > 0 && token.length < 4096) {
      const user = await this.authenticate(token);
      if (!user) {
        client.emit('auth.invalid', {});
      } else {
        data.user = user;
        await this.joinSubjectRooms(client, user);
      }
    }

    client.on('subscribe:property', (raw: unknown) => {
      const p = idSchema.safeParse(raw);
      if (!p.success) return;
      const room = rooms.property(p.data.id);
      if (data.propertyRooms.size >= MAX_PROPERTY_ROOMS && !data.propertyRooms.has(room)) return;
      data.propertyRooms.add(room);
      void client.join(room);
    });
    client.on('unsubscribe:property', (raw: unknown) => {
      const p = idSchema.safeParse(raw);
      if (!p.success) return;
      const room = rooms.property(p.data.id);
      data.propertyRooms.delete(room);
      void client.leave(room);
    });
    client.on('notifications:read', (raw: unknown) => {
      const p = readSchema.safeParse(raw);
      if (!p.success || !data.user) return;
      void this.notifications.markRead(data.user, { ids: p.data.ids }).catch(() => undefined);
    });
  }

  private async authenticate(token: string): Promise<(AuthUser & { exp: number }) | null> {
    const v = await this.tokens.verify(token).catch(() => null);
    if (!v) return null;
    if (await this.sessions.isAccessTokenRevoked(v.user.typ, v.user.id, v.iatMs)) return null;
    return v.exp ? { ...v.user, exp: v.exp } : null;
  }

  private async joinSubjectRooms(client: Socket, user: AuthUser & { exp: number }): Promise<void> {
    if (user.typ === 'customer') {
      const c = await this.prisma.customer.findUnique({ where: { id: user.id }, select: { status: true } });
      if (c?.status !== 'active') return;
      await client.join(rooms.customer(user.id));
    } else {
      const s = await this.prisma.staffUser.findUnique({
        where: { id: user.id },
        select: { isActive: true, deletedAt: true },
      });
      if (!s?.isActive || s.deletedAt) return;
      await client.join([rooms.staff, rooms.staffUser(user.id), ...(user.role ? [rooms.role(user.role)] : [])]);
    }
    const ms = user.exp * 1000 - Date.now();
    (client.data as SocketData).expiry = setTimeout(() => client.disconnect(true), Math.max(0, ms));
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData | undefined;
    if (data?.expiry) clearTimeout(data.expiry);
  }
}
