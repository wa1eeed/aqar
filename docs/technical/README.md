# NX Real Estate Platform — Technical Documentation

Technical documentation of the platform as **built** (the product specification it implements is in
`docs/00`–`docs/11`). It is maintained with the code: every change updates the relevant guide, and the
reference section is generated from the source (`pnpm run docs`; CI fails when it is stale).

## Who should read what

| You are… | Start with |
|---|---|
| A developer joining the project | [architecture](./architecture.md) → [backend](./backend.md) → [contributing](./contributing.md) → [testing](./testing.md) |
| Front-end developer | [frontend](./frontend.md) (public site) · [admin](./admin.md) (admin panel) |
| DevOps / system administrator | [operations](./operations.md) → [reference/environment](./reference/environment.md) → [security](./security.md) |
| Security reviewer / auditor | [security](./security.md) → [reference/permissions](./reference/permissions.md) → [reference/api-endpoints](./reference/api-endpoints.md) |
| Integrating a provider (payments, email, maps…) | [integrations](./integrations.md) |
| Continuing the build with an AI assistant | `docs/HANDOVER.md`, then this folder |

## Guides (hand-written)

| Guide | Contents |
|---|---|
| [architecture.md](./architecture.md) | System context, containers, request/auth/event/realtime/media flows, data ownership |
| [backend.md](./backend.md) | Module map, conventions, how-to recipes (endpoint, setting, event, provider, migration) |
| [admin.md](./admin.md) | Admin SPA structure, routing, API client, realtime, styling, adding a screen |
| [frontend.md](./frontend.md) | Public site boot, data layer, customer session, realtime, pages, URLs |
| [security.md](./security.md) | Implemented controls, threat → control matrix, PDPL measures |
| [operations.md](./operations.md) | Deployment, first run, jobs and queues, backups, monitoring, runbooks |
| [integrations.md](./integrations.md) | Each provider: purpose, configuration, webhooks, testing |
| [testing.md](./testing.md) | Test layers, running locally/CI, writing e2e tests, browser checks |
| [contributing.md](./contributing.md) | Workflow, definition of done (including documentation), commit style |
| [../../CHANGELOG.md](../../CHANGELOG.md) | What changed, phase by phase |

## Reference (generated from the code — do not edit)

| File | Source |
|---|---|
| [reference/api-endpoints.md](./reference/api-endpoints.md) | Controllers' route metadata + JSDoc: every endpoint with access, permissions, re-auth, CSRF, rate limits |
| [reference/environment.md](./reference/environment.md) | `backend/src/config/env.ts` |
| [reference/permissions.md](./reference/permissions.md) | `backend/src/common/auth/permissions.ts` |
| [reference/events.md](./reference/events.md) | `backend/src/modules/events/event-catalog.ts` + realtime events |
| [reference/settings.md](./reference/settings.md) | `backend/src/modules/settings/schemas/*` (defaults) |
| [reference/error-codes.md](./reference/error-codes.md) | Every `AppException` in the backend |
| [reference/data-model.md](./reference/data-model.md) | Prisma schema (ER diagram, models, enums) |

Interactive API schemas: Swagger UI at `/api/docs` when `SWAGGER_ENABLED=true` (never in production).

## Platform at a glance

- **Single company** real-estate platform: staff publish listings; customers browse, save, request
  viewings and (Phase 5) book with a deposit or full payment.
- **Monorepo** (pnpm): `packages/schema` (shared property schema), `backend` (NestJS API + worker),
  `admin` (React SPA), `frontend` (approved vanilla-JS public site), `infra` (Docker, Caddy, scripts).
- **Stack**: Node 20, TypeScript strict, NestJS 10, Prisma 5 / PostgreSQL 16, Redis 7, BullMQ,
  Socket.IO, React 18 + Vite 5, Caddy 2, Docker Compose. Arabic RTL first; money in halalas.
- **Status by phase**: see `docs/PROGRESS.md`.
