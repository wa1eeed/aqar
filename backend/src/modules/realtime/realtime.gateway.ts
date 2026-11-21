import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokensService } from '../auth/tokens.service.js';

// WebSocket على المسار /ws. الغرف لكل مستخدم/عقار (معرّفات فريدة عالمياً، فلا تصادم بين المشتركين).
@WebSocketGateway({ path: '/ws', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private readonly tokens: TokensService) {}

  handleConnection(client: Socket): void {
    client.join('public');
    const token = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return;
    try {
      const u = this.tokens.verifyAccess(token);
      if (u.typ === 'customer') {
        client.join(`customer:${u.sub}`);
      } else if (u.typ === 'staff') {
        client.join('staff');
        client.join(`staff:${u.sub}`);
        if (u.role) client.join(`role:${u.role}`);
      }
    } catch {
      /* رمز غير صالح → يبقى في public فقط */
    }
  }

  @SubscribeMessage('subscribe:property')
  onSubscribeProperty(@MessageBody() data: { id: number | string }, @ConnectedSocket() client: Socket): void {
    if (data?.id != null) client.join(`property:${data.id}`);
  }

  // ───────── مُرسِلات (تستعملها الخدمات) ─────────
  toStaffUser(id: string, event: string, data: unknown): void {
    this.server?.to(`staff:${id}`).emit(event, data);
  }
  toCustomer(id: string, event: string, data: unknown): void {
    this.server?.to(`customer:${id}`).emit(event, data);
  }
  toProperty(id: number | string, event: string, data: unknown): void {
    this.server?.to(`property:${id}`).emit(event, data);
  }
  toRole(role: string, event: string, data: unknown): void {
    this.server?.to(`role:${role}`).emit(event, data);
  }
}
