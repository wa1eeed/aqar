# Contributing

## Workflow

1. Read `CLAUDE.md`, `docs/HANDOVER.md`, the phase in `docs/11-implementation-plan.md` and the related
   spec files; open the screenshots of any screen you touch.
2. Work on a feature branch; commit per completed task with a conventional message:
   `feat(bookings): quote calculation`, `fix(auth): …`, `docs: …`, `chore: …`.
3. Keep `main` deployable: merge after the owner approves the phase.
4. Ambiguities: decide, implement, and append the decision to `docs/QUESTIONS.md` (numbered).

## Definition of done (every task)

1. Builds, lint, format and typecheck pass; all tests pass (`pnpm -r test`).
2. New behaviour has tests (unit for pure logic, e2e for endpoints: permissions, validation, audit,
   events).
3. API matches `docs/02-api.md`; every new endpoint has a JSDoc description and the right access,
   re-auth and rate-limit decorators.
4. UI matches its screenshot and copy; works at 390 px and 1440 px.
5. Every state change of a booking, payment, property status or lead is audited and emits its event.
6. **Documentation updated in the same commit:**
   - `pnpm docs` — regenerates `docs/technical/reference/*` (CI fails if stale);
   - the hand-written guide(s) in `docs/technical/` affected by the change (architecture, backend,
     admin, frontend, security, operations, integrations, testing);
   - `CHANGELOG.md` (Unreleased section);
   - at the end of a phase: `docs/PROGRESS.md` (acceptance results) and `docs/HANDOVER.md`
     (current state and next steps).

## Code rules (short)

- TypeScript strict; no `any` without a comment. ESLint + Prettier.
- `packages/schema` is the single source for property types/offers/statuses/fields/cities.
- Money in halalas (integers); server is the authority for prices, amounts and payment status.
- No third-party calls outside `IntegrationsGateway`; credentials only in the admin (encrypted).
- Arabic first for all UI copy; Gregorian dates with Latin digits; prices `en-US` + «ر.س».
- Never commit secrets (`.env` files are ignored); never log tokens, codes or passwords.
