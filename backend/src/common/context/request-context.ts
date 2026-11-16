import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

export interface Actor {
  type: 'staff' | 'customer' | 'system';
  id: string | null;
}

export interface RequestContext {
  correlationId: string;
  ip: string | null;
  userAgent: string | null;
  actor: Actor | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Correlation ids are returned in error bodies and propagated to integration calls (docs/10 §5). */
export function newCorrelationId(): string {
  return `c_${randomBytes(10).toString('hex')}`;
}

const SAFE_INCOMING_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Accept an upstream id only when it is short and harmless, otherwise mint our own. */
export function correlationIdFrom(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_INCOMING_ID.test(incoming) ? incoming : newCorrelationId();
}

export const requestContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
  correlationId(): string {
    return storage.getStore()?.correlationId ?? newCorrelationId();
  },
  setActor(actor: Actor): void {
    const ctx = storage.getStore();
    if (ctx) ctx.actor = actor;
  },
};
