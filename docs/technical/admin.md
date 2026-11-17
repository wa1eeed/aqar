# Admin panel (admin/)

React 18 + Vite 5 + react-router 6, TypeScript strict, Arabic RTL. Served by Caddy at `/admin`
(SPA fallback). Visual source: `design/screenshots/a-*.png` and `design/prototype/admin/admin.css`.

## Structure

| Path | Contents |
|---|---|
| `src/main.tsx` | Providers: `BrowserRouter(basename=/admin)` → `SessionProvider` → `RealtimeProvider` → `ToastProvider` → `App` + `ReauthHost` |
| `src/app/App.tsx` | Routes; each wrapped in `<Gate permission="…">`; unbuilt sections → `PlaceholderPage` (remove a path from it by adding it to `BUILT`) |
| `src/app/nav.ts` | Sidebar items (order, icons, permissions, groups) — docs/07 §1 |
| `src/app/Shell.tsx` | Sidebar (with counters), top bar, notification bell, sign-out |
| `src/app/session.tsx` | Session state (`me`, `can(permission)`), restore from refresh cookie |
| `src/lib/api.ts` | `api<T>(path, { method, body })`: in-memory access token, `X-Requested-With: nx`, one silent refresh on 401, re-auth prompt on `REAUTH_REQUIRED`; `download(path, filename)` for CSV/JSON; `fieldMessage()` translates field error codes |
| `src/lib/realtime.tsx` | Socket.IO connection (refreshes token and reconnects with backoff); `useRealtimeEvent(event, fn)` |
| `src/lib/format.ts` | `sar()`, `date()`, `dayLabel()`, `timeLabel()`, `timeAgo()`, `phoneLabel()` (Gregorian, Latin digits, Riyadh time) |
| `src/lib/types.ts` | API response types |
| `src/components/` | Icon, Modal, Toast, States (empty), Pills, MapPicker (Leaflet), CodeInput, ReauthModal, NotificationBell, ViewingModal, Countdown (hold timer), RefundModal |
| `src/pages/` | One file per screen (properties, editor, leads + drawer, viewings, customers, notifications, integrations, staff, roles, locations, bookings + detail, payments, transfer review, auth pages); `pages/settings/` holds the settings sections (`SettingsLayout` with section tabs + `Switch`, booking/payments, bank transfer) |
| `src/styles/` | `tokens.css` (site tokens), `base.css`, `admin.css` (prototype components + additions) |

Shared labels (stages, lead types, viewing statuses, property schema) come from `@nx/schema`
(aliased to the package source).

## Screens added in Phase 5 (bookings & payments)

| Route | Permission | Screen |
|---|---|---|
| `/bookings` | `bookings.view` | Status tabs with counts, search, hold countdown |
| `/bookings/:id` | `bookings.view` | Timeline, payments (receipt, refund), property, customer, financial summary; confirm / complete / cancel / extend hold (`bookings.manage`) |
| `/payments` | `payments.view` | Month totals per method, filters, refund, «إعادة التحقق» (reconcile) |
| `/payments/transfers` | `payments.review` | Receipt preview (streamed through the API), comparison with the amount due, approve / reject with reason |
| `/settings` | any `settings.*` | Redirects to the first section the user may edit |
| `/settings/booking` | `settings.booking` | Booking toggles and holds, per-offer policy (deposit fixed/percent, min/max, methods), payment methods with readiness (`GET /admin/payments/methods-status`), terms; live example |
| `/settings/bank-transfer` | `settings.payments` | Bank accounts (add/edit modal, IBAN check, on/off), instructions, next steps, file types and size; customer preview |
| `/settings/locations` | `settings.locations` | Cities and districts (now inside the settings tabs) |

The sidebar shows the number of bank transfers awaiting review next to «المدفوعات» (refreshed on the
`payment.updated` realtime event). To add a settings section, add it to `SETTINGS_TABS` in
`pages/settings/SettingsLayout.tsx` and route it in `App.tsx`.

Layout notes: wrap every `table.tbl` in `div.tbl-wrap` (horizontal scroll on phones); children of
`.g2/.g3/.g2e` grids have `min-width: 0` so wide content scrolls instead of widening the page.

## Adding a screen

1. Open its screenshot in `design/SCREENS.md`; reuse prototype classes (`adm-head`, `tools`, `panel2`,
   `tbl`, `pill p-*`, `kpi2`, `drawer2`, `cmp`, `steps2`, `seg`, `chip`).
2. Create `src/pages/XPage.tsx`; load data with `api`, show loading / empty / error states; mutate with
   toasts; listen to realtime events if the data changes live.
3. Route in `App.tsx` with the right `Gate`, add the path to `BUILT`.
4. Check at 1440 px and 390 px; `pnpm --filter @nx/admin build` and lint must pass.
5. Update this guide if you add shared components or conventions; add the change to `CHANGELOG.md`.

## Rules

- Never store tokens in localStorage (only per-user UI preferences such as desktop alerts).
- Permission checks in the UI are for convenience — the API enforces them.
- All copy in Arabic; numbers/dates via `lib/format.ts`.
