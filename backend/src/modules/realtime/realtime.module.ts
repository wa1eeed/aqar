import { Module } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { RealtimeGateway } from './realtime.gateway';

/** Socket.IO server (API process only). Emitting lives in the global RealtimeCoreModule. */
@Module({ providers: [RealtimeGateway, RateLimitService] })
export class RealtimeModule {}
