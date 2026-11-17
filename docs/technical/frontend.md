# Public site (frontend/)

The approved vanilla-JS site. **Do not redesign it**: new pages reuse its tokens
(`assets/css/main.css`), header/footer/cards (`assets/js/ui.js`) and RTL behaviour.

## Boot and data

| File | Role |
|---|---|
| `assets/js/config.js` | Static defaults (`dataSource: 'api'`, `apiBase: '/api/v1'`, contact, brand) |
| `assets/js/schema.js` | **Generated** from `packages/schema` (`pnpm schema:frontend`) — never edit |
| `assets/js/api.js` | Data layer (`MZ.api.listProperties/getProperty/getSimilar/getNearby/submitLead`, `params`); adds the customer token when signed in; mock implementation when `dataSource = 'mock'` |
| `assets/js/ui.js` | Formatting, cards, header/footer, modal, toast, favorites (`ui.fav`, synced to the account when signed in), `MZ.boot()` |
| `assets/js/session.js` | Customer session (`MZ.auth`), login modal (email code), header bell and account menu, realtime client (`MZ.rt`) |
| `assets/js/map.js` | Leaflet map helpers |
| `assets/js/pages/*.js` | One script per page |

Every page script runs inside `window.MZ.boot().then(function () { … })`. `boot()` loads
`/public/config` and `/public/schema` (cached 5 minutes in sessionStorage) and merges them into
`MZ.config` / `MZ.schema`. If the API is unreachable the site switches to the bundled demo data
(`data/properties.js`) — the frontend-only deployment keeps working. `?mock=1` forces mock mode.

## Customer session (`session.js`)

- Login: email → 6-digit code (6 boxes, paste, 60 s resend timer) → for new customers name, mobile and
  PDPL consent. `MZ.auth.openLogin(cb)` opens the modal; `MZ.auth.mountLogin(el, cb)` renders it inline.
- Tokens: access token in sessionStorage for its lifetime (15 min); refresh token in an httpOnly cookie;
  a `mz_auth` hint in localStorage avoids refresh calls for anonymous visitors.
- `MZ.auth.request(path, { method, body })`: authenticated call with one silent refresh.
- After login, browser favorites are merged into the account (`PUT /me/favorites`).
- Header: logged out → «دخول»; logged in → bell (live unread count, last 8) + «حسابي» menu; same items
  in the mobile drawer.

## Realtime (`MZ.rt`)

Socket.IO client loaded lazily from `/ws/socket.io.js` only on pages that need it (property, listing,
signed-in users). `MZ.rt.on(event, fn)`, `MZ.rt.subscribe(propertyId)`, `MZ.rt.connect()`. Reconnects
with backoff and re-subscribes rooms; refreshes the token when the server reports `auth.invalid`.

## Pages

| URL | File | Script |
|---|---|---|
| `/` | `index.html` | `home.js` |
| `/properties` | `properties.html` | `listing.js` (filters, «حفظ هذا البحث», live card status) |
| `/property/{id}-{slug}` (also `#p-{id}`, `?id=`) | `property.html` | `property.js` (viewing modal with consent, live status/price) |
| `/favorites` | `favorites.html` | `favorites.js` |
| `/about`, `/contact` | `about.html`, `contact.html` | `static.js`, `contact.js` |
| `/account` … | `account/{index,viewings,notifications,saved-searches,settings}.html` | `account.js` (login gate inline) |

Clean URLs: Caddy (and `deploy/nginx.conf`) serve `/x` from `x.html`, redirect `.html` URLs, map
`/property/{id}-{slug}` to `property.html` and `/account` to `account/index.html`.
Account pages use `assets/css/account.css` (components ported from the prototype + account layout).

## Adding a page

1. Copy the `<head>` of an existing page (fonts, `main.css`), keep `data-header`/`data-footer`, load
   `config.js`, `schema.js`, `api.js`, `ui.js`, `session.js`, then the page script.
2. Wrap the script in `MZ.boot().then(...)`, call `ui.mount('<nav id>')`.
3. Escape every dynamic value with `ui.esc` when building HTML strings (no inline scripts — CSP).
4. Add the clean-URL route if it is not a plain `/name` page; check 390 px and 1440 px.
