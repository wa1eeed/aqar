# Domain events and notification defaults

> **Generated** by `pnpm run docs` from the source code — do not edit by hand.
> Regenerate after any change; CI runs `pnpm docs:check`.

Keys are final (docs/06 §3). Emitted with `EventEmitter2` **after** the database transaction commits;
recipients and texts live in `backend/src/modules/notifications/notification-rules.ts`. Default channels
can be changed by admins (`settings.notifications.channels`) and by each recipient (preferences).
*Locked* events cannot be turned off by recipients.

| Event | In-app | Email | SMS | Locked |
|---|:-:|:-:|:-:|:-:|
| `lead.created` | ✓ | ✓ |  |  |
| `lead.assigned` | ✓ | ✓ |  |  |
| `lead.stage_changed` | ✓ |  |  |  |
| `viewing.requested` | ✓ | ✓ |  |  |
| `viewing.confirmed` | ✓ | ✓ | ✓ |  |
| `viewing.reminder` | ✓ | ✓ | ✓ |  |
| `booking.created` | ✓ |  |  | yes |
| `booking.confirmed` | ✓ | ✓ |  | yes |
| `booking.expired` | ✓ | ✓ |  | yes |
| `booking.cancelled` | ✓ | ✓ |  | yes |
| `booking.completed` | ✓ | ✓ |  | yes |
| `payment.paid` | ✓ | ✓ |  | yes |
| `payment.failed` | ✓ | ✓ |  | yes |
| `payment.transfer_submitted` | ✓ | ✓ |  | yes |
| `payment.transfer_approved` | ✓ | ✓ |  | yes |
| `payment.transfer_rejected` | ✓ | ✓ |  | yes |
| `payment.refunded` | ✓ | ✓ |  | yes |
| `payment.anomaly` | ✓ | ✓ |  | yes |
| `property.status_changed` | ✓ |  |  |  |
| `property.price_dropped` | ✓ | ✓ |  |  |
| `property.matched_saved_search` | ✓ | ✓ |  |  |
| `license.expiring` | ✓ | ✓ |  |  |
| `license.rega_invalid` | ✓ | ✓ |  |  |
| `integration.health_changed` | ✓ | ✓ |  |  |
| `email.bounced` | ✓ |  |  |  |
| `security.new_login` |  | ✓ |  | yes |
| `security.session_revoked` |  | ✓ |  | yes |
| `staff.broadcast` | ✓ |  |  |  |

### Realtime (Socket.IO `/ws`)

| Server → client event | Rooms | Payload |
|---|---|---|
| `notification.new` | `staff:{id}` / `customer:{id}` | `{ id, eventKey, title, body, link, priority, createdAt }` |
| `notification.count` | same | `{ unread }` |
| `lead.created` / `lead.updated` | `role:{key}` (roles with `leads.view`, unrestricted scope), `staff:{assignee}` | `{ id, number, stage, assignedToId }` |
| `property.updated` | `property:{id}`, `public` | `{ id, status, price (SAR), visibility }` |
| `property.published` / `property.unpublished` | `public` (+ `property:{id}`) | `{ id }` |
| `auth.invalid` | the socket | `{}` — the token was rejected; refresh and reconnect |

Client → server: `subscribe:property {id}`, `unsubscribe:property {id}`, `notifications:read {ids}` (validated; others ignored).
