# API endpoints

> **Generated** by `pnpm run docs` from the source code — do not edit by hand.
> Regenerate after any change; CI runs `pnpm docs:check`.

Base path `/api/v1`. **152 endpoints.** Access: `public` (no token; a valid token is still read),
`staff`, `customer` or `any signed-in`. Every listed permission is required. *Re-auth* = password/TOTP
within the last 10 minutes (`REAUTH_REQUIRED`). *CSRF* = header `X-Requested-With: nx` required.
Public GETs without a rule share the default limit of 120/min per IP. Request/response schemas:
Swagger UI at `/api/docs` (non-production, `SWAGGER_ENABLED=true`).

## admin/bookings

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/bookings` | staff | `bookings.view` |  |  |  | Bookings with status filter, search and per-status counts. |
| `GET` | `/api/v1/admin/bookings/:id` | staff | `bookings.view` |  |  |  | Booking details: property, customer, payments, transfer submission and audit timeline. |
| `POST` | `/api/v1/admin/bookings/:id/cancel` | staff | `bookings.manage` |  |  |  | Cancel with a reason; a reserved property returns to available. |
| `POST` | `/api/v1/admin/bookings/:id/complete` | staff | `bookings.manage` |  |  |  | Complete the deal (property becomes sold or rented). |
| `POST` | `/api/v1/admin/bookings/:id/confirm` | staff | `bookings.manage` |  |  |  | Confirm manually once the amount due has been received (property becomes reserved). |
| `POST` | `/api/v1/admin/bookings/:id/extend-hold` | staff | `bookings.manage` |  |  |  | Extend the payment hold by 1–168 hours. |

## admin/customers

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/customers` | staff | `customers.view` |  |  |  | Customers with counts of leads and bookings; agents see customers linked to them. |
| `GET` | `/api/v1/admin/customers/:id` | staff | `customers.view` |  |  |  | Customer profile with leads, viewings, favorites and saved searches. |
| `PATCH` | `/api/v1/admin/customers/:id` | staff | `customers.manage` |  |  |  | Block or unblock a customer (blocking ends all their sessions). |
| `GET` | `/api/v1/admin/customers/:id/export` | staff | `customers.manage` | yes |  |  | PDPL export on the customer's behalf (re-authentication required). |
| `GET` | `/api/v1/admin/customers/export.csv` | staff | `customers.view` | yes |  |  | CSV export of the filtered customers (re-authentication required). |

## admin/integrations

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/integrations` | staff | `integrations.manage` |  |  |  | All integrations grouped by category with status, health and environment (no secrets). |
| `GET` | `/api/v1/admin/integrations/:key` | staff | `integrations.manage` |  |  |  | One integration: config, masked secret hints, generated form definition and status. |
| `PUT` | `/api/v1/admin/integrations/:key` | staff | `integrations.manage` |  |  |  | Save config and/or secrets (write-only, encrypted); secrets need a recent re-authentication. |
| `POST` | `/api/v1/admin/integrations/:key/disable` | staff | `integrations.manage` |  |  |  | Disable an integration. |
| `POST` | `/api/v1/admin/integrations/:key/enable` | staff | `integrations.manage` |  |  |  | Enable an integration (refused for prepared integrations or missing credentials). |
| `GET` | `/api/v1/admin/integrations/:key/logs` | staff | `integrations.manage` |  |  |  | Recent call logs of an integration (redacted, 30-day retention). |
| `POST` | `/api/v1/admin/integrations/:key/test` | staff | `integrations.manage` |  |  |  | Run the provider's connection test through the gateway and record the result. |

## admin/leads

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/assignees` | staff | — |  |  |  | Names of staff a lead or viewing can be given to (agents only see themselves). |
| `GET` | `/api/v1/admin/leads` | staff | `leads.view` |  |  |  | Leads table with filters (stage, type, source, assignee, period, search); agents see assigned leads only. |
| `POST` | `/api/v1/admin/leads` | staff | `leads.manage` |  |  |  | Manual lead (phone call, WhatsApp, office visit); agents create leads for themselves. |
| `GET` | `/api/v1/admin/leads/:id` | staff | `leads.view` |  |  |  | Lead details with property, customer, viewings and the activity timeline. |
| `PATCH` | `/api/v1/admin/leads/:id` | staff | `leads.manage` |  |  |  | Edit a lead's contact details, message or property (audited). |
| `POST` | `/api/v1/admin/leads/:id/activities` | staff | `leads.manage` |  |  |  | Add a note or a contact log (call, WhatsApp, email); a first contact moves a new lead to contacted. |
| `POST` | `/api/v1/admin/leads/:id/assign` | staff | `leads.assign` |  |  |  | Assign or unassign a lead; audited, notifies the new assignee. |
| `POST` | `/api/v1/admin/leads/:id/customer` | staff | `leads.manage` |  |  |  | Link the lead to the matching customer account, or create one. |
| `POST` | `/api/v1/admin/leads/:id/stage` | staff | `leads.manage` |  |  |  | Move a lead to another stage (`lost` requires a reason); audited, notifies the assignee. |
| `GET` | `/api/v1/admin/leads/board` | staff | `leads.view` |  |  |  | Kanban board: the newest 50 leads of each stage and each column's total. |
| `GET` | `/api/v1/admin/leads/export.csv` | staff | `leads.view` | yes |  |  | PII export: re-authentication required (docs/03 §1 "data export"). |

## admin/locations

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/cities` | staff | `properties.view` |  |  |  | Read access for anyone who edits listings (city/district pickers). |
| `POST` | `/api/v1/admin/cities` | staff | `settings.locations` |  |  |  | Add a city. |
| `PATCH` | `/api/v1/admin/cities/:id` | staff | `settings.locations` |  |  |  | Edit a city (name, coordinates, order, active). |
| `POST` | `/api/v1/admin/districts` | staff | `properties.edit` |  |  |  | Agents/editors may add a district inline from the property editor (docs/07 §3 «إضافة حي»). |
| `PATCH` | `/api/v1/admin/districts/:id` | staff | `settings.locations` |  |  |  | Edit a district (name, coordinates, active). |

## admin/media

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `DELETE` | `/api/v1/admin/media/:id` | staff | `properties.edit` |  |  |  | Delete a media item and its stored files. |
| `PATCH` | `/api/v1/admin/media/:id` | staff | `properties.edit` |  |  |  | Edit a media item (alt text, sort, cover). |
| `POST` | `/api/v1/admin/media/:id/complete` | staff | `properties.edit` |  |  |  | Mark an upload finished and queue image processing (variants, EXIF removal). |
| `POST` | `/api/v1/admin/media/presign` | staff | `properties.edit` |  |  |  | Presigned R2 upload URL for a property photo or floor plan (type and size bound). |
| `POST` | `/api/v1/admin/media/video` | staff | `properties.edit` |  |  |  | Attach a YouTube or Vimeo video link to a property. |
| `POST` | `/api/v1/admin/properties/:id/media/reorder` | staff | `properties.edit` |  |  |  | Reorder a property's photos. |

## admin/notifications

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/notification-preferences` | staff | — |  |  |  | The staff member's notification preferences per event (in-app / email). |
| `PUT` | `/api/v1/admin/notification-preferences` | staff | — |  |  |  | Update the staff member's notification preferences (locked events cannot be turned off). |
| `GET` | `/api/v1/admin/notifications` | staff | — |  |  |  | The staff member's notifications (tabs, unread filter, archive) with the unread count. |
| `POST` | `/api/v1/admin/notifications/archive` | staff | — |  |  |  | Archive notifications. |
| `POST` | `/api/v1/admin/notifications/broadcast` | staff | `notifications.broadcast` |  |  |  | «إرسال تنبيه للفريق» — in-app announcement to the selected roles (docs/07 §8). |
| `POST` | `/api/v1/admin/notifications/read` | staff | — |  |  |  | Mark notifications as read (`ids` or `all`). |

## admin/payments

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/bank-accounts` | staff | `settings.payments` |  |  |  | Company bank accounts shown to customers for transfers. |
| `POST` | `/api/v1/admin/bank-accounts` | staff | `settings.payments` | yes |  |  | Add a bank account (IBAN validated with mod-97; re-authentication required). |
| `DELETE` | `/api/v1/admin/bank-accounts/:id` | staff | `settings.payments` | yes |  |  | Delete a bank account that has no transfer submissions (otherwise deactivate it). |
| `PATCH` | `/api/v1/admin/bank-accounts/:id` | staff | `settings.payments` | yes |  |  | Edit a bank account (re-authentication required). |
| `GET` | `/api/v1/admin/payments` | staff | `payments.view` |  |  |  | Payments with filters (status, method, search) and this month's totals; `status=under_review` is the transfer review queue. |
| `GET` | `/api/v1/admin/payments/:id` | staff | `payments.view` |  |  |  | Payment details with provider ids, events and the transfer submission. |
| `GET` | `/api/v1/admin/payments/:id/receipt.pdf` | staff | `payments.view` |  |  |  | Payment receipt PDF (staff copy). |
| `POST` | `/api/v1/admin/payments/:id/reconcile` | staff | `payments.view` |  |  |  | Re-check a pending online payment with the provider now. |
| `POST` | `/api/v1/admin/payments/:id/refund` | staff | `payments.refund` | yes |  |  | Refund all or part of a paid payment (Moyasar via the gateway; bank transfers recorded as refunded by finance). |
| `POST` | `/api/v1/admin/payments/:id/transfer/approve` | staff | `payments.review` |  |  |  | Approve a bank transfer receipt: payment paid, booking confirmed, customer notified. |
| `GET` | `/api/v1/admin/payments/:id/transfer/receipt` | staff | `payments.review` |  |  |  | The uploaded receipt file (streamed after the permission check; never cached). |
| `POST` | `/api/v1/admin/payments/:id/transfer/reject` | staff | `payments.review` |  |  |  | Reject a bank transfer receipt with a reason; the customer may upload again until the hold expires. |
| `GET` | `/api/v1/admin/payments/methods-status` | staff | `settings.payments` |  |  |  | Readiness of each payment method for the booking settings screen (integration + bank accounts). |

## admin/properties

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/properties` | staff | `properties.view` |  |  |  | Properties table with public filters plus visibility, agent and license state. |
| `POST` | `/api/v1/admin/properties` | staff | `properties.create` |  |  |  | Create a draft property (agents create their own); specs validated for drafts. |
| `DELETE` | `/api/v1/admin/properties/:id` | staff | `properties.delete` |  |  |  | Soft-delete a property (hidden from the site, kept for records). |
| `GET` | `/api/v1/admin/properties/:id` | staff | `properties.view` |  |  |  | Property for the editor, with publish problems and edit rights. |
| `PATCH` | `/api/v1/admin/properties/:id` | staff | `properties.edit` |  |  |  | Update a property (strict validation when published); audited; price drops notify favorites. |
| `POST` | `/api/v1/admin/properties/:id/duplicate` | staff | `properties.create` |  |  |  | Copy a property as a new draft (without media and licence). |
| `GET` | `/api/v1/admin/properties/:id/history` | staff | `properties.view` |  |  |  | Status history and audit entries of a property. |
| `POST` | `/api/v1/admin/properties/:id/publish` | staff | `properties.publish` |  |  |  | Publish (blocked without licence numbers, a valid expiry, a photo and required specs). |
| `POST` | `/api/v1/admin/properties/:id/rega-check` | staff | `properties.edit` |  |  |  | Check the ad licence with the REGA integration (when enabled). |
| `POST` | `/api/v1/admin/properties/:id/status` | staff | `properties.status` |  |  |  | Change the property status (limited by offer), with history and notifications. |
| `POST` | `/api/v1/admin/properties/:id/unpublish` | staff | `properties.publish` |  |  |  | Back to draft (hidden from the site). |

## admin/settings

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/settings` | staff | — |  |  |  | All settings sections the caller may edit, with current values. |
| `GET` | `/api/v1/admin/settings/:section` | staff | — |  |  |  | One settings section (current value, defaults applied). |
| `PUT` | `/api/v1/admin/settings/:section` | staff | — |  |  |  | Replace a settings section (validated by its zod schema, audited, cache invalidated). |
| `POST` | `/api/v1/admin/settings/branding/assets/:kind` | staff | `settings.branding` |  |  | 30/1h per ip | Upload a logo, dark-background logo, favicon (→ 16/32/180/192/512 PNG), share image or email logo; returns its URL to save in the settings. |

## admin/staff

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/roles` | staff | `roles.manage` |  |  |  | System and custom roles with their permissions. |
| `POST` | `/api/v1/admin/roles` | staff | `roles.manage` | yes |  |  | Create a custom role. |
| `PATCH` | `/api/v1/admin/roles/:id` | staff | `roles.manage` | yes |  |  | Update a custom role (system roles are read-only). |
| `GET` | `/api/v1/admin/staff` | staff | `staff.manage` |  |  |  | Team members with role, 2FA state, invitation state and last login. |
| `POST` | `/api/v1/admin/staff` | staff | `staff.manage` | yes |  |  | Invite a staff member (creates the account and emails a 72-hour invitation link). |
| `PATCH` | `/api/v1/admin/staff/:id` | staff | `staff.manage` | yes |  |  | Update a staff member (profile, role, active flag); the last owner cannot be removed. |
| `POST` | `/api/v1/admin/staff/:id/resend-invite` | staff | `staff.manage` |  |  |  | Send a new invitation link (the previous one stops working). |
| `POST` | `/api/v1/admin/staff/:id/reset-2fa` | staff | `staff.manage` | yes |  |  | Reset a staff member's 2FA (they must set it up again; sessions end). |

## admin/viewings

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/viewings` | staff | `viewings.manage` |  |  |  | Viewings in a date range (max 62 days) for the calendar; agents see their own. |
| `POST` | `/api/v1/admin/viewings` | staff | `viewings.manage` |  |  |  | Schedule a viewing (optionally from a lead); confirmed viewings notify the customer. |
| `GET` | `/api/v1/admin/viewings/:id` | staff | `viewings.manage` |  |  |  | One viewing. |
| `PATCH` | `/api/v1/admin/viewings/:id` | staff | `viewings.manage` |  |  |  | Reschedule, reassign or change the status of a viewing; confirmation notifies the customer. |

## auth

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/customer/otp/send` | public | — |  |  | 5/1h per body:destination, 20/1h per ip | Send a 6-digit login code to a customer's email (no account enumeration). |
| `POST` | `/api/v1/auth/customer/otp/verify` | public | — |  |  | 10/1h per body:destination, 30/15min per ip | Verify a customer login code: returns tokens, or a registration token for new customers. |
| `POST` | `/api/v1/auth/customer/password/login` | public | — |  |  | 10/15min per ip | Customer login with email + password (only if the customer set one). |
| `POST` | `/api/v1/auth/customer/password/set` | customer | — |  |  |  | Set or change the signed-in customer's optional password. |
| `POST` | `/api/v1/auth/customer/register` | public | — |  |  | 10/15min per ip | Complete a new customer's account (name, Saudi mobile, PDPL consent) and sign in. |
| `POST` | `/api/v1/auth/logout` | public | — |  | yes |  | End the current session (revokes the refresh-token family and clears the cookie). |
| `GET` | `/api/v1/auth/me` | any signed-in | — |  |  |  | The signed-in subject: staff profile with role and permissions, or customer profile. |
| `POST` | `/api/v1/auth/refresh` | public | — |  | yes | 60/1min per ip | Rotate the refresh cookie and issue a new access token (30-second grace for parallel tabs). |
| `POST` | `/api/v1/auth/staff/2fa` | public | — |  |  | 20/15min per ip | Complete staff login with a TOTP or recovery code for the login challenge. |
| `POST` | `/api/v1/auth/staff/2fa/enable` | public | — |  |  | 20/15min per ip | Confirm 2FA setup with a TOTP code; returns recovery codes and finishes login. |
| `POST` | `/api/v1/auth/staff/2fa/setup` | public | — |  |  | 20/15min per ip | Start mandatory 2FA setup during login: returns the QR code and secret. |
| `POST` | `/api/v1/auth/staff/invite/accept` | public | — |  |  | 10/1h per ip | Accept a staff invitation: set the password from the invite token. |
| `POST` | `/api/v1/auth/staff/login` | public | — |  |  | 10/15min per ip | Staff login with email + password; returns tokens or the next step (TOTP, password change, 2FA setup). |
| `POST` | `/api/v1/auth/staff/me/2fa/enable` | staff | — |  |  | 20/15min per ip | Confirm optional 2FA setup with a TOTP code; returns recovery codes. |
| `POST` | `/api/v1/auth/staff/me/2fa/setup` | staff | — |  |  |  | Start optional 2FA setup for a signed-in staff member. |
| `POST` | `/api/v1/auth/staff/password/change` | staff | — |  |  | 10/15min per ip | Change the signed-in staff member's password (ends other sessions). |
| `POST` | `/api/v1/auth/staff/password/forgot` | public | — |  |  | 5/1h per body:email, 20/1h per ip | Request a staff password-reset link by email (same response whether or not the email exists). |
| `POST` | `/api/v1/auth/staff/password/initial` | public | — |  |  | 20/15min per ip | First-login forced password change (inside the login challenge). |
| `POST` | `/api/v1/auth/staff/password/reset` | public | — |  |  | 10/1h per ip | Set a new staff password from a reset link token (single use, 30 minutes). |
| `POST` | `/api/v1/auth/staff/reauth` | staff | — |  |  | 10/15min per ip | Confirm identity (password or TOTP) to open the 10-minute re-authentication window. |

## health

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/health` | public | — |  |  |  | Liveness and dependency checks (database, Redis, queue lag). |
| `GET` | `/api/v1/ready` | public | — |  |  |  | Readiness for load balancers. |

## me

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `DELETE` | `/api/v1/me` | customer | — |  |  |  | PDPL deletion request: signs out everywhere; personal data is anonymised after 30 days. |
| `GET` | `/api/v1/me/export` | customer | — |  |  | 5/1h per ip | PDPL export of everything stored about the customer (JSON). |
| `GET` | `/api/v1/me/favorites` | customer | — |  |  |  | Ids of the customer's favorite published properties. |
| `PUT` | `/api/v1/me/favorites` | customer | — |  |  |  | Merge the browser's local favorites into the account (on login). |
| `DELETE` | `/api/v1/me/favorites/:propertyId` | customer | — |  |  |  | Remove a property from favorites. |
| `PUT` | `/api/v1/me/favorites/:propertyId` | customer | — |  |  |  | Add a property to favorites. |
| `GET` | `/api/v1/me/profile` | customer | — |  |  |  | The customer's profile. |
| `PATCH` | `/api/v1/me/profile` | customer | — |  |  | 20/1h per ip | Update name, phone and marketing consent; a new email is applied only after code verification. |
| `POST` | `/api/v1/me/profile/verify-email` | customer | — |  |  | 10/1h per ip | Confirm a new email address with the code sent to it. |
| `GET` | `/api/v1/me/saved-searches` | customer | — |  |  |  | The customer's saved searches. |
| `POST` | `/api/v1/me/saved-searches` | customer | — |  |  |  | Save a search (public list query) with a daily alert. |
| `DELETE` | `/api/v1/me/saved-searches/:id` | customer | — |  |  |  | Delete a saved search. |
| `PATCH` | `/api/v1/me/saved-searches/:id` | customer | — |  |  |  | Rename a saved search or toggle its alert. |
| `POST` | `/api/v1/me/sessions/revoke-all` | customer | — |  |  |  | «تسجيل الخروج من جميع الأجهزة». |
| `GET` | `/api/v1/me/viewings` | customer | — |  |  |  | The customer's viewings and requests. |
| `POST` | `/api/v1/me/viewings/:id/cancel` | customer | — |  |  |  | Cancel one of the customer's upcoming viewings. |

## me/bookings

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/me/bookings` | customer | — |  |  |  | The customer's bookings with payments, transfer submission and timeline. |
| `POST` | `/api/v1/me/bookings` | customer | — |  |  | 10/1h per ip | Create a booking (row lock + one active booking per property → 409) and start its payment; Idempotency-Key supported. |
| `GET` | `/api/v1/me/bookings/:id` | customer | — |  |  |  | One of the customer's bookings with its next payment action (bank transfer details or existing payment link). |
| `POST` | `/api/v1/me/bookings/:id/cancel` | customer | — |  |  |  | Cancel while the booking is pending payment or awaiting transfer review. |
| `POST` | `/api/v1/me/bookings/:id/pay` | customer | — |  |  | 20/1h per ip | Start another payment attempt (e.g. after a failed card payment) within the same hold. |
| `POST` | `/api/v1/me/bookings/quote` | customer | — |  |  | 60/1min per ip | Amounts, payment types and available methods for booking a property (server-computed). |

## me/notifications

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/me/notification-preferences` | customer | — |  |  |  | The customer's notification preferences per event. |
| `PUT` | `/api/v1/me/notification-preferences` | customer | — |  |  |  | Update the customer's notification preferences (locked events cannot be turned off). |
| `GET` | `/api/v1/me/notifications` | customer | — |  |  |  | The customer's notifications with the unread count. |
| `POST` | `/api/v1/me/notifications/archive` | customer | — |  |  |  | Archive the customer's notifications. |
| `POST` | `/api/v1/me/notifications/read` | customer | — |  |  |  | Mark the customer's notifications as read (`ids` or `all`). |

## me/payments

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/me/payments/:id/receipt.pdf` | customer | — |  |  | 30/1h per ip | Payment receipt PDF of one of the customer's paid payments. |
| `POST` | `/api/v1/me/payments/:id/transfer` | customer | — |  |  | 10/1h per ip | Upload a bank transfer receipt (multipart: receipt + fields); the booking waits for review. |
| `POST` | `/api/v1/me/payments/:id/verify` | customer | — |  |  | 30/1min per ip | Called by the result page after a provider redirect: re-fetches the payment from the provider. |

## public

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/v1/public/agents/:id` | public | — |  |  |  | Public card of a listing agent. |
| `GET` | `/api/v1/public/config` | public | — |  |  |  | Everything the static site needs at boot: brand, theme, contact, licensing, map, features (no secrets). |
| `POST` | `/api/v1/public/leads` | public | — |  |  | 10/1h per ip | docs/02 §2.2; 10/hour/IP (docs/02 §1), Idempotency-Key supported. |
| `GET` | `/api/v1/public/properties` | public | — |  |  |  | Published properties with the site's filters, sorting and paging (closed listings last). |
| `GET` | `/api/v1/public/properties/:id` | public | — |  |  |  | One published property (public payload; location may be approximate). |
| `GET` | `/api/v1/public/properties/:id/nearby` | public | — |  |  |  | Nearby places around a property through the places provider, cached. |
| `GET` | `/api/v1/public/properties/:id/similar` | public | — |  |  |  | Similar published properties (same type, then offer, then city). |
| `GET` | `/api/v1/public/schema` | public | — |  |  |  | Merged schema: property types/fields from @nx/schema plus active cities and districts. |
| `GET` | `/api/v1/public/stats` | public | — |  |  |  | Counts of published, non-closed properties by type, city and offer. |

## site

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `GET` | `/brand/:file` | public | — |  |  |  | Uploaded brand files (logos, favicon sizes, share image); content-hashed names, cached forever. |
| `GET` | `/site.webmanifest` | public | — |  |  |  | Web app manifest built from the branding settings (name, colours, generated icons). |
| `GET` | `/theme.css` | public | — |  |  |  | Generated theme variables + font import; immutable when requested with the current `?v=`. |

## webhooks

| Method | Path | Access | Permissions | Re-auth | CSRF | Rate limit | Description |
|---|---|---|---|---|---|---|---|
| `POST` | `/api/v1/webhooks/moyasar` | public | — |  |  | 600/1min per ip | Moyasar payment events; the payment is re-fetched from Moyasar before anything changes. |
| `POST` | `/api/v1/webhooks/resend` | public | — |  |  | 600/1min per ip | Resend email events (Svix signature verified, idempotent). |

