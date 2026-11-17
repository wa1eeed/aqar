# Roles and permissions

> **Generated** by `pnpm run docs` from the source code — do not edit by hand.
> Regenerate after any change; CI runs `pnpm docs:check`.

System roles are seeded and read-only (docs/03 §3). "own" scope = agents see only their listings,
assigned leads, own viewings and linked customers (enforced in services by `AccessScopeService`;
out-of-scope rows answer 404). Custom roles can be created in the admin panel.

| Permission | owner | admin | sales_manager | agent | finance | content_editor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `dashboard.view` | ✓ | ✓ | ✓ | own | ✓ | ✓ |
| `properties.view` | ✓ | ✓ | ✓ | own | ✓ | ✓ |
| `properties.create` | ✓ | ✓ | ✓ | own |  | ✓ |
| `properties.edit` | ✓ | ✓ | ✓ | own |  | ✓ |
| `properties.status` | ✓ | ✓ | ✓ | own |  |  |
| `properties.publish` | ✓ | ✓ | ✓ |  |  | ✓ |
| `properties.delete` | ✓ | ✓ |  |  |  |  |
| `leads.view` | ✓ | ✓ | ✓ | own |  |  |
| `leads.manage` | ✓ | ✓ | ✓ | own |  |  |
| `leads.assign` | ✓ | ✓ | ✓ |  |  |  |
| `viewings.manage` | ✓ | ✓ | ✓ | own |  |  |
| `customers.view` | ✓ | ✓ | ✓ | own | ✓ |  |
| `customers.manage` | ✓ | ✓ |  |  |  |  |
| `bookings.view` | ✓ | ✓ | ✓ | own | ✓ |  |
| `bookings.manage` | ✓ | ✓ | ✓ |  | ✓ |  |
| `payments.view` | ✓ | ✓ |  |  | ✓ |  |
| `payments.review` | ✓ | ✓ |  |  | ✓ |  |
| `payments.refund` | ✓ |  |  |  | ✓ |  |
| `notifications.broadcast` | ✓ | ✓ | ✓ |  |  |  |
| `reports.view` | ✓ | ✓ | ✓ |  | ✓ |  |
| `seo.manage` | ✓ | ✓ |  |  |  | ✓ |
| `settings.general` | ✓ | ✓ |  |  |  |  |
| `settings.branding` | ✓ | ✓ |  |  |  | ✓ |
| `settings.contact` | ✓ | ✓ |  |  |  |  |
| `settings.legal` | ✓ | ✓ |  |  |  | ✓ |
| `settings.licensing` | ✓ | ✓ |  |  |  |  |
| `settings.booking` | ✓ | ✓ |  |  | ✓ |  |
| `settings.payments` | ✓ | ✓ |  |  | ✓ |  |
| `settings.notifications` | ✓ | ✓ |  |  |  |  |
| `settings.maps` | ✓ | ✓ |  |  |  |  |
| `settings.features` | ✓ | ✓ |  |  |  |  |
| `settings.locations` | ✓ | ✓ |  |  |  |  |
| `integrations.manage` | ✓ | ✓ |  |  |  |  |
| `staff.manage` | ✓ | ✓ |  |  |  |  |
| `roles.manage` | ✓ | ✓ |  |  |  |  |
| `audit.view` | ✓ | ✓ |  |  |  |  |
| `auctions.manage` | ✓ | ✓ | ✓ |  |  |  |

| Role | Arabic name | Mandatory 2FA | Scope |
|---|---|---|---|
| `owner` | مالك المنشأة | yes | all |
| `admin` | مدير النظام | yes | all |
| `sales_manager` | مدير المبيعات | no | all |
| `agent` | مستشار عقاري | no | own |
| `finance` | المالية | yes | all |
| `content_editor` | محرر المحتوى | no | all |
