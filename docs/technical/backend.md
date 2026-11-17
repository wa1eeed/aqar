# Backend (backend/)

NestJS 10, TypeScript strict, Prisma 5, Redis (ioredis), BullMQ 5, Socket.IO 4, zod via nestjs-zod.
Entry points: `src/main.ts` (API), `src/worker.ts` (jobs), `src/cli/index.ts` (operations),
`src/cli/docs.ts` (documentation generator). Shared hardening: `src/bootstrap.ts`.

## 1. Module map

| Path | Purpose |
|---|---|
| `config/` | `env.ts` (zod-validated environment), `ConfigModule` (`ENV` token) |
| `prisma/`, `redis/`, `queue/` | Prisma client, Redis client, BullMQ queues (`email`, `media`, `integrations`, `crm`) |
| `common/auth/` | `AuthGuard`, decorators, `permissions.ts` (permission keys + system roles), `AccessScopeService` |
| `common/errors/` | `AppException`, `AllExceptionsFilter` |
| `common/rate-limit/` | `@RateLimit`, guard, Redis sliding-window service |
| `common/security/` | CSRF guard, zod helpers (`plainText`, `richText`, `boundedArray`), phone normalisation, redaction, HTML sanitising |
| `common/http/` | JSON shape middleware, BigInt-safe JSON, CSV export helper |
| `modules/auth` | Staff and customer authentication, sessions, TOTP, password policy, keyed hashes, cookies |
| `modules/staff`, `modules/settings` | Team and roles; settings sections (`schemas/*.ts`) |
| `modules/crypto` | `EncryptionService` (AES-256-GCM with AAD, key rotation support) |
| `modules/audit` | `AuditService.record(entry, tx?)` |
| `modules/integrations` | Gateway, store (encrypted secrets), generated admin forms, providers |
| `modules/email` | Outbox, templates, worker delivery |
| `modules/properties`, `media`, `locations`, `public`, `nearby` | Listings domain and public API |
| `modules/leads`, `viewings`, `customers` | CRM and customer accounts |
| `modules/notifications`, `realtime`, `events` | Notification pipeline and rules, Socket.IO, event catalog |
| `modules/webhooks`, `health` | Provider webhooks; health/readiness |
| `cli/` | `seed.ts`, `seed-demo.ts`, `rotate-encryption-key.ts`, `docs.ts` |

The full endpoint list with permissions is generated: [reference/api-endpoints.md](./reference/api-endpoints.md).

## 2. Conventions (follow them in every change)

- **Routes are denied by default.** Decorate every handler: `@Public()`, `@Staff('perm.key', …)`,
  `@Customer()` or `@Authenticated()`; add `@RecentAuth()` for sensitive actions (secrets, staff/roles,
  refunds, data exports) and `@RateLimit(...)` where abuse is possible.
- **Document every handler** with a one-line JSDoc — it becomes its description in the API reference
  (`pnpm docs` fails on an undocumented endpoint).
- **DTOs**: `class X extends createZodDto(z.object({...}).strict())`. Free text: `plainText(max)`;
  rich text: `richText(max)`; arrays: `boundedArray`. Never trust ids, amounts or statuses from clients.
- **Row-level access**: AND every staff query with `this.scope.forStaff(user).<entity>()`; customer
  queries filter by `customerId: user.id`. Out-of-scope rows → 404.
- **Money**: halalas as `bigint` in code and `BigInt` columns; convert only at the edges (the public
  property payload keeps `price` in SAR for the legacy frontend).
- **State changes**: inside `prisma.$transaction(async (tx) => …)`, with `audit.record({...}, tx)`;
  emit the domain event **after** the transaction; invalidate caches before emitting.
- **Errors**: `throw new AppException('CODE', status, 'رسالة عربية', { fields })`. Field errors use
  message codes (e.g. `invalid_phone`), translated by the clients.
- **Third parties**: only through `IntegrationsGateway` (`gateway.email()`, `.storage()`,
  `.payments()`, `.places()`, `.maps()`), never from controllers or the browser.
- **Logging**: `Logger` (pino); never log secrets, codes or tokens (redaction paths in
  `common/logging.ts`); include ids, not personal data.

## 3. Recipes

### Add an endpoint
1. DTO with zod (`.strict()`), handler with access decorator, JSDoc, rate limit if public.
2. Service method with scope checks, transaction, audit, event.
3. e2e test (permissions, validation, happy path) in `backend/test/*.e2e-spec.ts`.
4. `pnpm docs` (regenerates the reference), update the relevant guide and `CHANGELOG.md`.

### Add a settings field or section
Edit/add the zod schema in `modules/settings/schemas/` with a `.default(...)`; register new sections in
`schemas/index.ts` with the permission that may edit them. Defaults appear in
[reference/settings.md](./reference/settings.md) after `pnpm docs`.

### Add a domain event / notification
1. Add the key to `events/event-catalog.ts` (default channels, `locked` for transactional events).
2. Emit it after the transaction: `this.events.emit('booking.confirmed', { … ids … })`.
3. Handle it in `notifications/notification-rules.ts` (`@OnEvent`, `safe()` wrapper): recipients,
   Arabic title/body/link, optional email template (`email/templates.ts` + key in
   `settings/schemas/notifications.ts` `EMAIL_TEMPLATE_KEYS`).
4. Add customer/staff events to `CUSTOMER_EVENTS` / `STAFF_EVENTS` so they appear in preferences.

### Add an integration provider
1. `modules/integrations/providers/<name>.ts`: `configSchema`, `secretsSchema`, `uiHints` (Arabic
   labels), `testConnection(ctx)`, plus operation functions using `ctx.http` only.
2. Register it in `providers/index.ts`; expose operations through a facade method in
   `gateway.service.ts` (`this.run(key, 'operation', fn, { idempotent })`).
3. Document it in [integrations.md](./integrations.md).

### Change the database
Edit `prisma/schema.prisma`, then create a migration (`npx prisma migrate dev --name <name>` or
`prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
in non-interactive shells). Add new tables to `resetDb()` in `test/auth-helpers.ts`. CI fails on drift.

### Add a background job
Add a queue (or a job name) in `queue/queue.module.ts`, a processor in `worker.ts`, and a scheduler
(`upsertJobScheduler`) if it is periodic. Make jobs idempotent (Redis `SET NX` keys or DB state checks)
and document them in [operations.md](./operations.md#jobs-and-queues).

## 4. Domain notes

- **Properties**: specs validated against `@nx/schema` (relaxed for drafts, strict on publish);
  `publishProblems()` lists what blocks publishing; status changes write `PropertyStatusHistory`;
  public reads are cached in Redis under a version key bumped by `invalidatePublic()`; public
  coordinates may be jittered when the exact location is hidden.
- **Leads**: public leads are idempotent (`Idempotency-Key`, 24 h) and auto-assigned (listing agent,
  else round-robin among agents, or manager-only routing); stage changes are audited and notify.
- **Viewings**: slots stored in UTC (Riyadh = UTC+3); only confirmed viewings block an agent's time.
- **Customers**: deletion = immediate sign-out + anonymisation after 30 days (worker job).
- **Notifications**: see [architecture §6](./architecture.md#6-events-notifications-and-realtime).
- **Bookings & payments** (`modules/bookings`, `modules/payments`):
  - `quote.ts` — pure amount/method rules (unit-tested). `BookingsService.create` locks the property row
    (`SELECT … FOR UPDATE`) and relies on the partial unique index `one_active_booking` → `409
    BOOKING_PROPERTY_UNAVAILABLE` for the loser of a race; supports `Idempotency-Key`.
  - `BookingTransitions.apply(tx, booking, to, …)` is the only way to change a booking status: it
    validates the state machine (docs/04 §4), applies the property side effect with a
    `PropertyStatusHistory` row (`booking_confirmed` / `booking_completed` / `booking_cancelled`), audits,
    and returns the events to emit after commit.
  - `PaymentsService.reconcile` re-fetches from Moyasar and marks a payment paid only when status,
    amount, currency and `metadata.paymentId` match (row lock, idempotent); mismatches raise
    `payment.anomaly`. Webhooks only queue a reconcile. `markPaid` allocates the receipt number,
    increments `amountPaid` and auto-confirms when fully paid.
  - `TransfersService`: receipt upload (file type detected from its bytes, size limit, private storage via
    `FileStore`), review approve/reject; `iban.ts` validates Saudi IBANs (mod-97).
  - `FileStore` uses the private R2 bucket; in development/test without R2 it writes to
    `backend/.uploads` (never in staging/production).
